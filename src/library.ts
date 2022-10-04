import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {wrapper} from 'axios-cookiejar-support';
import {CookieJar} from 'tough-cookie';
import qs from 'qs';
import {load} from 'cheerio';
import assert from "assert";

export type SeatInfo = {
	roomNo: string,
	seatNo: string,
	roomName: string,
	seatName: string,
	leftTime: number
};

export class Library {
	private client: AxiosInstance;

	private readonly username: string;
	private readonly password: string;
	private readonly timeout: number;

	constructor(username: string, password: string, timeout: number) {
		this.username = username;
		this.password = password;
		this.timeout = timeout;

		this.client = wrapper(axios.create({
			jar: new CookieJar(),
			headers: {
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.27(0x18001b14) NetType/WIFI Language/zh_CN'
			},
			timeout: this.timeout,
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
					'username': this.username,
					'password': this.password
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

	/**
	 * 判断是否预约过座位
	 */
	async hasBespeakedSeat(): Promise<false | SeatInfo> {
		return this.ajaxMethod('Menu2', 'HaveBespeaked').then((result: string) => {
			const bespeaked = result.slice(1, -4) === '1';
			if (bespeaked) {
				return this.getSeatInfo().then((seat: null | SeatInfo) => {
					if (seat !== null) {
						return seat!;
					}

					throw new Error('已预约, 但是获取占座结果失败');
				});
			}

			return false;
		});
	}

	/**
	 * 获取预约的座位信息
	 */
	async getSeatInfo(): Promise<null | SeatInfo> {
		return this.client.get('http://tsgic.hebust.edu.cn/seat/MyCurBespeakSeat.aspx').then((result: AxiosResponse<string>) => {
			return load(result.data);
		}).then((currentSeat) => {
			if (!currentSeat('input#hidseatno').val()) {
				return null;
			}

			return {
				roomNo: currentSeat('input#hidroomno').val() as string,
				seatNo: currentSeat('input#hidseatno').val() as string,
				roomName: currentSeat('input#lblRoomName').val() as string,
				seatName: currentSeat('input#lblSeatNo').val() as string,
				leftTime: parseInt(currentSeat('input#hidlefttime').val() as string)
			};
		});
	}

	/**
	 * 调用服务器 ajaxpro 方法
	 * @param  path 执行路径
	 * @param method 执行方法
	 * @param data
	 * @private
	 */
	private async ajaxMethod(path: string, method: string, data?: any): Promise<string> {
		return this.client({
			url: `http://tsgic.hebust.edu.cn/ajaxpro/WechatTSG.Web.Seat.${path},WechatTSG.Web.ashx`,
			method: 'post',
			data: data,
			headers: {
				'X-AjaxPro-Method': method,
				'Origin': 'http://tsgic.hebust.edu.cn',
				'Referer': `http://tsgic.hebust.edu.cn/seat/${path.split('.').join('/')}.aspx`
			}
		}).then((result: AxiosResponse<string>) => {
			return result.data;
		});
	}

	/**
	 * 获取当前占座时间
	 */
	async getBespeakTime(): Promise<null | string> {
		// "2022/10/3 8:00:00";/*
		return this.ajaxMethod('BespeakSeat.BespeakChoice', 'GetBespeakTime').then((result: string) => {
			const time = result.slice(1, -4);
			if (time.length) {
				return time;
			}

			return null;
		});
	}

	/**
	 * 获取剩余喜好座位
	 */
	async getPreferredSeatRemain(): Promise<null | string> {
		// "101013159";/*
		return this.ajaxMethod('BespeakSeat.BespeakChoice', 'SeatCanBeUsed').then((result: string) => {
			const seat = result.slice(1, -4);
			if (seat.length) {
				return seat;
			}

			return null;
		});
	}

	/**
	 * 一键预约喜好座位
	 * @param bespeakTime 预约时间, 如: 2022/10/3 8:00:00
	 */
	async oneKeyBespeak(bespeakTime: string): Promise<SeatInfo> {
		return this.getPreferredSeatRemain().then((seat: null | string) => {
			if (!seat) {
				throw new Error('喜好座位均被约！！！');
			}

			return this.bespeakSeat(seat, bespeakTime);
		});
	}

	/**
	 * 预约座位
	 * @param seatNo 座位号, 如: 101013159
	 * @param bespeakTime 预约时间, 如: 2022/10/3 8:00:00
	 */
	async bespeakSeat(seatNo: string, bespeakTime: string): Promise<SeatInfo> {
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
		}).then((seat: null | SeatInfo) => {
			if (!seat) {
				throw new Error('预约成功, 但无法获取到座位信息!');
			}

			return seat;
		});
	}

}
