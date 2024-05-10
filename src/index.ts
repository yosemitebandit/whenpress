/**

// render page for a specific device: GET whenpress.net/lilac
1. see if that device exists, e.g. 'lilac' in devices
2. lookup that device via data:lilac -> data
3. lookup latest ping via ping:lilac -> timestamp
4. render all this info

// send data from a specific device: POST whenpress.net/sage/data
1. see if that device exists, e.g. 'sage' in devices
2. validate permissions via auth:sage -> password matches hashed version of posted pw
3. append data by first fetching data:sage KV and then appending

// send ping from device: POST whenpress.net/sage/ping
1. see if that device exists, e.g. 'sage' in devices
2. validate permissions via auth:sage -> password matches hashed version of posted pw
3. register ping via ping:DEVICE1

// create device
1. do this via dashboard only (no methods to do this via the app)

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

type Bindings = {
	DB: KVNamespace,
}

const app = new Hono<{ Bindings: Bindings }>()

app.get("/", async c => {
	const devices = await c.env.DB.get("devices")
	return devices
	  ? c.text(devices)
	  : c.text('not found', 404)
})

app.get("/list", async c => {
  const list = await c.env.DB.list()
	return c.json({ keys: list.keys.map(k => k.name) })
})

export default app
