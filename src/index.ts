/*
// KV schema:
devices -> [DEVICE1, DEVICE2, DEVICE3, ..]
auth:DEVICE1 -> PW1 (string)
data:DEVICE1 -> {DATA1} (json)
ping:DEVICE1 -> UTC timestamp (string; int compatible)

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

interface DeviceData {
	events: EventData[];
}
interface EventData {
	pressTimestamp: number,
}

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
	// Lookup data for the device.
	let data = {}
	let deviceData = await c.env.DB.get(`data:${device}`)
	if (deviceData == null) {
		data = {
			device: device,
			presses: 0,
			lastPress: null,
			ping: '',
		}
	} else {
		let jsonData: DeviceData = JSON.parse(deviceData)
		data = {
			device: device,
			presses: jsonData.events.length,
			lastPress: Math.max(...jsonData.events.map((event: EventData) => event.pressTimestamp)),
			ping: '',
		}
	}
	// Lookup and inject ping data.
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

app.post("/:device/data", async c => {
	/* Receive device data.
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
	// Register the incoming data.
	const postedData = await c.req.json()
	if (!postedData.pressTimestamp) {
		return c.text('error', 400)
	}
	// First get the existing data in the db.
	let existingData = await c.env.DB.get(`data:${device}`)
	let updatedData: DeviceData = { events: [] }
	if (existingData == null) {
		// Populate for the first time.
		updatedData = {
			events: [{
				pressTimestamp: postedData.pressTimestamp
			}]
		}
	} else {
		// Append.
		let jsonData: DeviceData = JSON.parse(existingData)
		updatedData = {
			events: [...jsonData.events, { pressTimestamp: postedData.pressTimestamp }]
		}
	}
	await c.env.DB.put(`data:${device}`, JSON.stringify(updatedData))
	// Respond.
	return c.text('ok')
})

export default app
