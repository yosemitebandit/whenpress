/*

// send data from a specific device: POST whenpress.net/sage/data
1. see if that device exists, e.g. 'sage' in devices
2. validate permissions via auth:sage -> password matches hashed version of posted pw
3. append data by first fetching data:sage KV and then appending

// KV schema:
devices -> [DEVICE1, DEVICE2, DEVICE3, ..]
auth:DEVICE1 -> PW1 (string)
data:DEVICE1 -> {DATA1} (json)
ping:DEVICE1 -> UTC timestamp (string; int compatible)

// schema of values at data:DEVICEX (JSON)
{
	events: [{
		pressTimestamp: 12345,
	}, {
		pressTimestamp: 12347,
	}, {
		pressTimestamp: 12360,
	}]
}

*/

import { Hono } from 'hono'
import mustache from 'mustache'
import moment from 'moment'

type Bindings = {
	DB: KVNamespace,
}

const app = new Hono<{ Bindings: Bindings }>()

const homeTemplate = `
<!doctype html>
<html>
	<body>
		<h3>whenpress</h3>
	</body>
</html>
`

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
`

app.get("/", async c => {
	/* Render homepage.
	*/
	const renderedHtml = mustache.render(homeTemplate, {})
	return c.html(renderedHtml)
})

app.get("/:device", async c => {
	/* Render page for a specific device.
	*/
	const device = c.req.param('device')
	// See if the device exists
	const devices = await c.env.DB.get("devices")
	if (devices == null) {
		return c.text('error', 500)
	}
	const validDevices = JSON.parse(devices)
	if (!validDevices.includes(device)) {
		return c.text('not found', 404)
	}
	// TODO: lookup press data
	let data = {
		device: device,
		presses: 4,
		lastPress: 123,
		ping: '',
	}
	// Lookup ping data.
	const latestPing = await c.env.DB.get(`ping:${device}`)
	if (latestPing != null) {
		const pingTime = moment.unix(parseInt(latestPing, 10))
		const timeAgo = moment(pingTime).fromNow()
		data.ping = timeAgo
	}
	// Render.
	const renderedHtml = mustache.render(deviceTemplate, data)
	return c.html(renderedHtml)
})

app.post("/:device/ping", async c => {
	/* Receive a device ping.
	*/
	const device = c.req.param('device')
	// See if the device exists
	const devices = await c.env.DB.get("devices")
	if (devices == null) {
		return c.text('error', 500)
	}
	const validDevices = JSON.parse(devices)
	if (!validDevices.includes(device)) {
		return c.text('not found', 404)
	}
	// TODO: authenticate
	// Register the ping.
	const now = Math.floor(Date.now() / 1000)
	await c.env.DB.put(`ping:${device}`, now.toString())
	// Respond.
	return c.text('pong')
})

export default app
