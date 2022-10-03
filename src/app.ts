import axios from 'axios';
import schedule from 'node-schedule';
import consoleStamp from 'console-stamp';
import crypto from 'crypto';
import {Library, SeatInfo} from './library';


consoleStamp(console, {format: ':date(yyyy/mm/dd HH:MM:ss.l) :label'});


async function dingtalk_push(message: string | Error): Promise<void> {
	if (typeof (message) === 'string') {
		console.info(message);
	}

	const hmac = crypto.createHmac('sha256', process.env.DINGTALK_WEBHOOK_SECRET as string);

	const timestamp = Date.now();
	const sign = hmac.update(`${timestamp}\n${process.env.DINGTALK_WEBHOOK_SECRET}`).digest('base64');

	axios({
		url: process.env.DINGTALK_WEBHOOK_URL,
		method: 'post',
		params: {
			'timestamp': timestamp,
			'sign': sign
		},
		data: {
			'msgtype': 'text',
			'text': {
				'content': message.toString()
			}
		}
	}).then((result: { data: { errcode: number, errmsg: string } }) => {
		console.debug('dingtalk push result', result.data);

		if (result.data.errcode !== 0) {
			throw Error(result.data.errmsg);
		}
	}).catch(e => {
		console.error(e);
	});
}


async function reserveSeat(): Promise<void> {
	const library = new Library();

	console.info('正在登录');
	library.login().then(() => {
		console.info('已登陆, 即将查询座位预约情况');

		return library.getSeatInfo();
	}).then(async (seat: false | SeatInfo) => {
		if (seat) {
			console.info('已有座位, 不再自动占座');
			return false;
		}

		return library.getBespeakTime().then((bespeakTime) => {
			return Promise.any(Array(5).fill(0).map(() => {
				return library.oneKeyReservePreferredSeat(bespeakTime);
			}));
		}).catch((e) => {
			if (e instanceof AggregateError) {
				throw e.errors[0];
			}

			throw e;
		});
	}).then((seat: false | SeatInfo) => {
		return seat ? dingtalk_push(`已占座: ${seat.room} ${seat.seatNo}`) : null;
	}).catch((e) => {
		console.error(e);

		dingtalk_push(e);
	}).finally(() => {
		console.info('本次占座结束');
	});
}


for (const param of ['USERNAME', 'PASSWORD', 'DINGTALK_WEBHOOK_URL', 'DINGTALK_WEBHOOK_SECRET']) {
	if (!(process.env[param])) {
		console.error(`need ${param}`);
		process.exit(1);
	}

	console.debug(`${param}: ${process.env[param]}`);
}

// 每天晚上十点半
schedule.scheduleJob("0 30 22 ? * *", async () => await reserveSeat());
schedule.scheduleJob("0 31 22 ? * *", async () => await reserveSeat());

reserveSeat().then();
