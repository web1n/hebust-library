import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {wrapper} from 'axios-cookiejar-support';
import {CookieJar} from 'tough-cookie';
import qs from 'qs';
import {load} from 'cheerio';
import assert from "assert";

export type SeatInfo = {
	room: string,
	seatNo: string,
	leftTime: number
};

export class Library {
	private client: AxiosInstance;

	constructor() {
		this.client = wrapper(axios.create({
			jar: new CookieJar(),
			headers: {
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.27(0x18001b14) NetType/WIFI Language/zh_CN'
			},
			timeout: 8000,
			maxRedirects: 1
		}));
	}

	async login(): Promise<void> {
		return this.client.get('https://m.5read.com/2149').then(() => {
			return this.client({
				url: 'https://mc.m.5read.com/irdUser/login/opac/opacLogin.jspx',
				method: 'post',
				data: qs.stringify({
					'schoolid': 2149,
					'backurl': '',
					'userType': 0,
					'username': process.env.USERNAME,
					'password': process.env.PASSWORD
				}),
				headers: {
					'Origin': 'https://mc.m.5read.com',
					'Referer': 'https://mc.m.5read.com/irdUser/login/opac/opacLogin.jspx',
				}
			});
		}).then((result: AxiosResponse<string>) => {
			const errorText = load(result.data)('em, font[color=red]').text();
			if (errorText) {
				throw new Error(errorText);
			}
		}).then(() => {
			return this.client.get('https://mc.m.5read.com/cmpt/opac/opacLink.jspx?stype=1');
		}).then((result: AxiosResponse) => {
			return new URL(result.request.res.responseUrl).searchParams.get('sn');
		}).then((sn: string | null) => {
			assert(sn, 'can not fetch sn info');

			return this.client.get('http://tsgic.hebust.edu.cn/seat/validate.aspx', {
				params: {
					'needsn': true,
					'sn': sn
				}
			});
		});
	}

	private async ajaxMethod(type: string, method: string, data?: any, timeout: number = 5000): Promise<string> {
		return this.client({
			url: `http://tsgic.hebust.edu.cn/ajaxpro/WechatTSG.Web.Seat.${type},WechatTSG.Web.ashx`,
			method: 'post',
			data: data,
			headers: {
				'X-AjaxPro-Method': method,
				'Origin': 'http://tsgic.hebust.edu.cn',
				'Referer': 'http://tsgic.hebust.edu.cn/seat/Menu2.aspx'
			},
			timeout: timeout
		}).then((result: AxiosResponse<string>) => {
			return result.data;
		});
	}

	async hasReservedSeat(): Promise<false | SeatInfo> {
		return this.ajaxMethod('Menu2', 'HaveBespeaked').then((result: string) => {
			console.debug(result);

			return result.startsWith('"1"') ? this.getSeatInfo() : false;
		});
	}

	async getSeatInfo(): Promise<false | SeatInfo> {
		return this.client.get('http://tsgic.hebust.edu.cn/seat/MyCurBespeakSeat.aspx').then((result: AxiosResponse<string>) => {
			return load(result.data);
		}).then((currentSeat) => {
			if (!currentSeat('input#lblRoomName').val()) {
				return false;
			}

			return {
				room: currentSeat('input#lblRoomName').val() as string,
				seatNo: currentSeat('input#lblSeatNo').val() as string,
				leftTime: parseInt(currentSeat('input#hidlefttime').val() as string)
			};
		});
	}

	async getBespeakTime(): Promise<string> {
		// "2022/10/3 8:00:00";/*
		return this.ajaxMethod('BespeakSeat.BespeakChoice', 'GetBespeakTime').then((result: string) => {
			return result.slice(1, -4);
		});
	}

	async getPreferredSeatRemain(): Promise<false | string> {
		return this.ajaxMethod('BespeakSeat.BespeakChoice', 'SeatCanBeUsed').then((result: string) => {
			// "101013159";/*
			return result.slice(1, -4);
		}).then((seat: string) => {
			return seat.length ? seat : false;
		});
	}

	async oneKeyReservePreferredSeat(bespeakTime: string): Promise<SeatInfo> {
		return this.getPreferredSeatRemain().then((seat: false | string) => {
			if (!seat) {
				throw new Error('喜好座位均被约！！！');
			}

			return this.oneKeyReserve(seat, bespeakTime);
		});
	}

	async oneKeyReserve(seatNo: string, bespeakTime: string): Promise<SeatInfo> {
		return this.ajaxMethod('BespeakSeat.BespeakChoice', 'OnekeyBespeak', {
			'strSeatNo': seatNo,
			'BespeakTime': bespeakTime
		}).then((_: string) => {
			return this.client.get('http://tsgic.hebust.edu.cn/seat/BespeakSeat/SubmitBespeak.aspx');
		}).then((result: AxiosResponse<string>) => {
			return load(result.data)('script').text();
		}).then((result) => {
			if (result.includes('入馆确认')) {
				return true;
			}

			throw new Error(`预约失败: ${result}`);
		}).then(() => {
			return this.getSeatInfo();
		}).then((seat: false | SeatInfo) => {
			if (!seat) {
				throw new Error('预约成功, 但无法获取到座位信息!');
			}

			return seat;
		});
	}
}
