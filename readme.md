### local dev
have to run `wrangler dev` in a separate tab,
or specify `--local` in your `wrangler commands`,
e.g. if you're `put`ting a key into KV

examples
```
curl -X POST \
-H "Content-Type: application/json" \
http://localhost:8787/sage/ping

curl -X POST \
-H "Content-Type: application/json" \
-d '{"pressTimestamp": 1715408340}' \
http://localhost:8787/sage/data
```

### xbee and micropython
- seems that the module must be named `main.py` for it to autostart on an xbee
- getting started guide with all the right settings:
https://cdn.sparkfun.com/assets/f/2/a/2/5/OEM__Digi__recommended_getting_started_guide_-_Xbee_Cellular1.pdf
- have to put `urequests` in `lib/` on the device


### init
- add devices
- for each device add auth info via command line -- see `src/hashPassword.js`.
With zsh use single quotes to prevent var expansion on hash components like `$2a$10`
