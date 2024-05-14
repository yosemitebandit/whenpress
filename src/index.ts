import { Context, Hono } from 'hono';
import bcrypt from 'bcryptjs';
import mustache from 'mustache';
import moment from 'moment';

type Bindings = {
	DB: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

const homeTemplate = `
<!doctype html>
<html>
	<body>
		<h3>whenpress</h3>
	</body>
</html>
`;

const deviceTemplate = `
<!doctype html>
<html>
	<body>
		<h3>device: '{{ device }}'</h3>
		<p>presses: {{ presses }}</p>
		<p>last press: {{ lastPress }}</p>
		<p>latest ping: {{ ping }}</p>
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
	// Lookup data for the device.
	let data = {
		device: device,
		presses: 0,
		lastPress: null as null | number,
		ping: null as null | string,
	};
	let deviceData = await c.env.DB.get(`data:${device}`);
	if (deviceData != null) {
		let jsonData: DeviceData = JSON.parse(deviceData);
		data = {
			device: device,
			presses: jsonData.events.length,
			lastPress: Math.max(...jsonData.events.map((event: EventData) => event.pressTimestamp)),
			ping: null,
		};
	}
	// Lookup and inject ping data.
	const latestPing = await c.env.DB.get(`ping:${device}`);
	if (latestPing != null) {
		const pingTime = moment.unix(parseInt(latestPing, 10));
		const timeAgo = moment(pingTime).fromNow();
		data.ping = timeAgo;
	}
	// Render.
	const renderedHtml = mustache.render(deviceTemplate, data);
	return c.html(renderedHtml);
});

app.use('/:device/ping', deviceExistsMiddleware);
app.use('/:device/ping', checkAuth);
app.post('/:device/ping', async (c) => {
	/* Receive a device ping.
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
