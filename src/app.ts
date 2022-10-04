import schedule from 'node-schedule';
import consoleStamp from 'console-stamp';
import {Library, SeatInfo} from './library';
import {dingtalkPush, sleep} from './utils';


consoleStamp(console, {format: ':date(yyyy/mm/dd HH:MM:ss.l) :label'});

/**
 * 钉钉推送
 * @param message
 */
async function push(message: string | Error): Promise<void> {
	await dingtalkPush(
		process.env.DINGTALK_WEBHOOK_URL as string,
		process.env.DINGTALK_WEBHOOK_SECRET as string,
		message
	);
}


async function bespeakSeat(): Promise<void> {
	const library = new Library(
		process.env.USERNAME!,
		process.env.PASSWORD!,
		parseInt(`${process.env.TIMEOUT ?? 20}`) * 1000
	);

	console.info('正在登录');
	library.login().then(() => {
		console.info('已登陆, 即将查询座位预约情况');

		return library.hasBespeakedSeat();
	}).then(async (seat: false | SeatInfo) => {
		if (seat) {
			console.info('已有座位, 不再自动占座', seat);
			return false;
		}

		let bespeakTime = await library.getBespeakTime();
		if (!bespeakTime) {
			console.info('等待开始预约');
		}
		for (const _ in Array(60).fill(0)) {
			if (bespeakTime) {
				break;
			}

			await sleep(1000);
			bespeakTime = await library.getBespeakTime();
		}
		if (!bespeakTime) {
			throw new Error('当前时间不可约！！！');
		}

		return Promise.any(Array(10).fill(0).map(() => {
			return library.oneKeyBespeak(bespeakTime!);
		})).catch((e) => {
			if (e instanceof AggregateError) {
				throw e.errors[0];
			}

			throw e;
		});
	}).then((seat: false | SeatInfo) => {
		return seat ? push(`已占座: ${seat.roomName} ${seat.seatName}`) : null;
	}).catch((e) => {
		console.error(e);

		push(e);
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
