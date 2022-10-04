import crypto from 'crypto';
import axios from 'axios';


/**
 * 钉钉推送
 * @param url webhook url
 * @param secret webhook secret
 * @param message
 */
export async function dingtalkPush(url: string, secret: string, message: string | Error): Promise<boolean> {
	if (typeof (message) === 'string') {
		console.info(message);
	}

	const hmac = crypto.createHmac('sha256', secret);

	const timestamp = Date.now();
	const sign = hmac.update(`${timestamp}\n${secret}`).digest('base64');

	return axios({
		url: url,
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

		return true;
	}).catch(e => {
		console.error(e);

		return false;
	});
}

export async function sleep(ms: number): Promise<void> {
	return new Promise<void>((resolve) => {
		setTimeout(() => resolve(), ms);
	});
}
