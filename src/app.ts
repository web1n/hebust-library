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
	library.login().then(async () => {
		console.info('已登陆, 即将查询座位预约情况');

		return await library.getBespeakSeatInfo() || await library.getCurrentSeatInfo();
	}).then(async seat => {
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

async function updateSeat() {
	const library = new Library(
		process.env.USERNAME!,
		process.env.PASSWORD!,
		parseInt(`${process.env.TIMEOUT ?? 20}`) * 1000
	);

	console.info('正在登录');
	library.login().then(() => {
		console.info('已登陆, 即将更新座位预约情况');

		return library.getBespeakSeatInfo();
	}).then(async (seat: null | SeatInfo) => {
		if (!seat) {
			return false;
		}

		let bespeakTime = await library.getBespeakTime();
		if (bespeakTime === null) {
			throw new Error('未获取到预约时间');
		}

		await library.cancelBespeak();
		return Promise.any(Array(3).fill(0).map(() => {
			return library.bespeakSeat(seat.seatNo, bespeakTime!);
		})).catch((e) => {
			if (e instanceof AggregateError) {
				throw e.errors[0];
			}

			throw e;
		});
	}).then(seat => {
		if (seat) {
			console.info('已重新预约座位', seat);
		} else {
			console.info('未占座或已签到, 不需要继续操作');
		}
	}).catch((e) => {
		console.error(e);

		push(e);
	}).finally(() => {
		console.info('本次座位更新结束');
	});
}

for (const param of ['USERNAME', 'PASSWORD', 'DINGTALK_WEBHOOK_URL', 'DINGTALK_WEBHOOK_SECRET']) {
	if (!(process.env[param])) {
		console.error(`need ${param}`);
		process.exit(1);
	}

	console.debug(`${param}: ${process.env[param]}`);
}


// 自动预约
for (const rule in [
	{hour: 22, minute: [29, 31]}, // 每晚十点半
	{dayOfWeek: 5, hour: 12, minute: [29, 31]} // 周四十二点半约晚上
]) {
	schedule.scheduleJob(rule, async () => await bespeakSeat());
}
bespeakSeat().then();


// 自动更新座位
if (process.env.AUTO_UPDATE === 'true') {
	console.info('已启动座位自动更新');

	schedule.scheduleJob({
		hour: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
		minute: [2, 42]
	}, async () => await updateSeat());
}
