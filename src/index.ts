/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { Hono } from 'hono'

type Bindings = {
	MyAI: any
}

const app = new Hono<{ Bindings: Bindings }>()

app.get("/", async c => {

	const response = await c.env.MyAI.run(
		"@cf/mistral/mistral-7b-instruct-v0.1",
		{ prompt: "tell me a very unique and funny joke" }
	);

	return c.json(response)
})

export default app
