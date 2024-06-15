import { Context, Hono } from 'hono';
import bcrypt from 'bcryptjs';
import mustache from 'mustache';
import moment from 'moment';

type Bindings = {
	DB: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();
const ACTIVITY_THRESHOLD = 10 * 60;

const homeTemplate = `
<!doctype html>
<html>
	<body>
		<h3>whenpress</h3>
	</body>
</html>
`;

// TODO: show list of presses
// TODO: show presses in last 1wk, 24hr, 1hr
const deviceTemplate = `
<!doctype html>
<html>
	<body>
		<h3>Button: '{{ device }}' (online: {{ deviceOnline }})</h3>
		<p>Button Presses: {{ presses }}</p>
		<p>Last Button Press: {{ lastPressRelative }}</p>
	</body>
</html>
`;

interface DeviceData {
	events: EventData[];
}
interface EventData {
	pressTimestamp: number;
}

async function deviceExistsMiddleware(c: Context, next: () => Promise<void>) {
	const device = c.req.param('device');
	const devices = await c.env.DB.get('devices');
	if (devices == null || !JSON.parse(devices).includes(device)) {
		return c.text('not found', 404);
	}
	await next();
}

async function checkAuth(c: Context, next: () => Promise<void>) {
	const device = c.req.param('device');
	const postedData = await c.req.json().catch(() => ({}));
	if (!postedData.password) {
		return c.text('error', 400);
	}
	const storedAuth = await c.env.DB.get(`auth:${device}`);
	if (storedAuth === null) {
		return c.text('error', 501);
	}
	const authIsValid = await bcrypt.compare(postedData.password, storedAuth);
	if (!authIsValid) {
		return c.text('error', 401);
	}
	await next();
}

app.get('/', async (c) => {
	/* Render homepage.
	 */
	const renderedHtml = mustache.render(homeTemplate, {});
	return c.html(renderedHtml);
});

app.use('/:device', deviceExistsMiddleware);
app.get('/:device', async (c) => {
	/* Render page for a specific device.
	 */
	const device = c.req.param('device');
	// Track when the device was last active based on ping and press data.
	let lastActive = null;
	// Lookup data for the device.
	let data = {
		device: device,
		presses: 0,
		lastPressRelative: null as null | string,
		deviceOnline: null as null | boolean,
	};
	let deviceData = await c.env.DB.get(`data:${device}`);
	if (deviceData != null) {
		let jsonData: DeviceData = JSON.parse(deviceData);
		const lastPress = Math.max(...jsonData.events.map((event: EventData) => event.pressTimestamp));
		lastActive = lastPress;
		const lastPressTime = moment.unix(lastPress);
		data = {
			device: device,
			presses: jsonData.events.length,
			lastPressRelative: moment(lastPressTime).fromNow(),
			deviceOnline: null,
		};
	}
	// Lookup ping data to help determine if device is online.
	const lastPing = await c.env.DB.get(`ping:${device}`);
	if (lastPing != null) {
		const pingTime = parseInt(lastPing, 10);
		if (lastActive === null || pingTime > lastActive) {
			lastActive = pingTime;
		}
	}
	const now = moment().unix();
	if (lastActive === null || now - lastActive > ACTIVITY_THRESHOLD) {
		data.deviceOnline = false;
	} else {
		data.deviceOnline = true;
	}
	// Render.
	const renderedHtml = mustache.render(deviceTemplate, data);
	return c.html(renderedHtml);
});

app.use('/:device/ping', deviceExistsMiddleware);
app.use('/:device/ping', checkAuth);
app.post('/:device/ping', async (c) => {
	/* Receive a device ping.
	 * TODO: also store as json, like other data?
	 */
	const device = c.req.param('device');
	// Register the ping.
	const now = Math.floor(Date.now() / 1000);
	await c.env.DB.put(`ping:${device}`, now.toString());
	// Respond.
	return c.text('pong');
});

app.use('/:device/data', deviceExistsMiddleware);
app.use('/:device/data', checkAuth);
app.post('/:device/data', async (c) => {
	/* Receive device data.
	 */
	const device = c.req.param('device');
	// Register the incoming data.
	const postedData = await c.req.json();
	if (!postedData.pressTimestamp) {
		return c.text('error', 400);
	}
	// First get the existing data in the db.
	let existingData = await c.env.DB.get(`data:${device}`);
	let updatedData: DeviceData = { events: [] };
	if (existingData == null) {
		// Populate for the first time.
		updatedData = {
			events: [
				{
					pressTimestamp: postedData.pressTimestamp,
				},
			],
		};
	} else {
		// Append.
		let jsonData: DeviceData = JSON.parse(existingData);
		updatedData = {
			events: [...jsonData.events, { pressTimestamp: postedData.pressTimestamp }],
		};
	}
	await c.env.DB.put(`data:${device}`, JSON.stringify(updatedData));
	// Respond.
	return c.text('ok');
});

export default app;
