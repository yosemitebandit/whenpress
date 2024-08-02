import { Context, Hono } from 'hono';
import bcrypt from 'bcryptjs';
import mustache from 'mustache';
import moment from 'moment';
import 'moment-timezone';

type Bindings = {
	DB: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();
const ACTIVITY_THRESHOLD = 10 * 60;

const homeTemplate = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://cdn.simplecss.org/simple.min.css">
    <style>
      article {
        margin-top: 20px;
			}
		</style>
		<link rel="icon" href="data:image/png;base64,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">
    <title>WhenPress</title>
	</head>
	<body>
    <article>
		  <h2>WhenPress</h2>
      <p>When did I last push that button 🤔</p>
      <a href="https://github.com/yosemitebandit/whenpress">source</a>
    </article>
	</body>
</html>
`;

// TODO: show presses in last 1wk, 24hr, 1hr
const deviceTemplate = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://cdn.simplecss.org/simple.min.css">
    <style>
      article {
        margin-top: 20px;
			}
		</style>
		<link rel="icon" href="data:image/png;base64,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">
    <title>{{ deviceName }} - WhenPress</title>
	</head>
	<body>
    <article>
		  <h2>{{ deviceTitle }}</h2>
			<p><kbd>Button Presses:</kbd>
			<kbd>{{ presses }}</kbd></p>
			<p><kbd>Last Button Press:</kbd>
			<kbd>{{ lastPressRelative }}</kbd></p>
			<details id="accordion">
				<summary>All Button Presses ({{ tzShortName }}):</summary>
				<small>
				<ol reversed>
					{{ #allPresses }}
						<li>{{ . }}</li>
					{{ /allPresses }}
				</ol>
				</small>
			</details>
      <a href="https://github.com/yosemitebandit/whenpress">source</a>
    </article>
    <script>
      const accordion = document.getElementById("accordion")
      if (localStorage.getItem("accordionOpen") === "true") {
        accordion.open = true;
			}
      accordion.addEventListener("toggle", () => {
        localStorage.setItem("accordionOpen", accordion.open)
			});
    </script>
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

function formatDeviceDataToRelativeTimes(deviceData: DeviceData, timezone): string[] {
	const reversedData = deviceData.events.slice().reverse();
	return reversedData.map((entry) => {
		const pressMoment = moment.unix(entry.pressTimestamp).tz(timezone);
		const formattedDateTime = pressMoment.format('ddd MMM D, YYYY h:mmA');
		const relativeTime = pressMoment.fromNow();
		return `${formattedDateTime} (${relativeTime})`;
	});
}

app.get('/', async (c) => {
	/* Render homepage.
	 */
	const renderedHtml = mustache.render(homeTemplate, {});
	return c.html(renderedHtml);
});

app.use('/:device', deviceExistsMiddleware);
app.get('/:device', async (c: Context) => {
	/* Render page for a specific device.
	 */
	const deviceName = c.req.param('device');
	// Setup data for the template.
	let templateData = {
		deviceName: deviceName,
		deviceTitle: null as null | string,
		presses: 0,
		lastPressRelative: null as null | string,
		allPresses: null as null | string[],
	};
	// Track when the device was last active based on ping and press data.
	let lastActive = null;
	// Lookup data for the device.
	let deviceData = await c.env.DB.get(`data:${deviceName}`);
	if (deviceData != null) {
		let jsonData: DeviceData = JSON.parse(deviceData);
		// Attempt to ascertain the client's TZ.
		const clientTimezone = c.req.raw.cf?.timezone || 'Etc/GMT';
		const allPresses = formatDeviceDataToRelativeTimes(jsonData, clientTimezone);
		const lastPress = Math.max(...jsonData.events.map((event: EventData) => event.pressTimestamp));
		lastActive = lastPress;
		const lastPressTime = moment.unix(lastPress);
		templateData = {
			deviceName: deviceName,
			deviceTitle: null,
			presses: jsonData.events.length,
			lastPressRelative: moment(lastPressTime).fromNow(),
			allPresses: allPresses,
			tzShortName: moment().tz(clientTimezone).format('z'),
		};
	}
	// Lookup ping data to help determine if device is online.
	const lastPing = await c.env.DB.get(`ping:${deviceName}`);
	if (lastPing != null) {
		const pingTime = parseInt(lastPing, 10);
		if (lastActive === null || pingTime > lastActive) {
			lastActive = pingTime;
		}
	}
	let deviceTitle = null;
	const now = moment().unix();
	if (lastActive === null || now - lastActive > ACTIVITY_THRESHOLD) {
		deviceTitle = `${deviceName} is offline`;
	} else {
		deviceTitle = `${deviceName} is online`;
	}
	templateData.deviceTitle = deviceTitle;
	// Render.
	const renderedHtml = mustache.render(deviceTemplate, templateData);
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
