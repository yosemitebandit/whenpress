a small button that tracks when it has been pressed

- `device/` contains code (micropython) for a simple device: button, RTC and a radio (currently xbee)
- the rest is a webapp (ts) for receiving device data, storing it and rendering device history
- uses cloudflare kv and cf workers


### running the server with wrangler
first init some devices:

```
$ npx wrangler \
kv key put \
"devices" '["link", "zelda", "epona"]' \
--binding=DB --local
```

add auth -- generate the hash via `hashPassword.js`.
When adding to kv, note the single quotes particularly around the hash,
this prevents variable expansion in zsh, e.g. for the parts like `$2a`

```
$ node src/hashPassword.js 'asdfasdf123'
$2a$10$Py8UruAPFBngNLr7FFpaLeJ/9o4Vx3I6T6zd5sEt2NAlic7DzMUpy

$ npx wrangler \
kv key put \
"auth:epona" '$2a$10$Py8UruAPFBngNLr7FFpaLeJ/9o4Vx3I6T6zd5sEt2NAlic7DzMUpy' \
--binding=DB --local
```

setup the prod server in the same way, just omit `--local`

start the dev server
```
$ npx wrangler dev
```

register a ping
```
$ curl -X POST \
-H "Content-Type: application/json" \
-d '{"password": "asdfasdf123"}'
http://localhost:8787/epona/ping
```

send some data
```
$ curl -X POST \
-H "Content-Type: application/json" \
-d '{"pressTimestamp": 1715408340, "password": "asdfasdf123"}' \
http://localhost:8787/epona/data
```

deploy
```
npx wrangler deploy
```

visit `http://localhost:8787/epona` to see the latest data


### kv schema
- devices -> "[DEVICE1, DEVICE2, DEVICE3, ...]" (string, json-compatible)
- auth:DEVICE1 -> "PW1" (string)
- data:DEVICE1 -> "{DEVICEDATA1}" (string, json-compatible)
- ping:DEVICE1 -> "UTC timestamp" (string; int compatible)


### ts testing
- er the tests came with the tutorial
and I haven't removed them from the repo..
nor have I updated them..so they don't work


### the hardware device (xbee) and micropython
- flip the switch on the devboard for I2C/DUSB to I2C mode
- for code to auto-start on xbee, the module must be named `main.py`
- have to put `urequests` in `lib/` on the device fs,
same with the SFE qwiic button lib
- hw interrupts are not available on the xbee dev board,
have to use polling for the on-device button :/
- the devboard's getting started guide with all the right settings:
https://cdn.sparkfun.com/assets/f/2/a/2/5/OEM__Digi__recommended_getting_started_guide_-_Xbee_Cellular1.pdf
- digi's xbee cellular guide:
https://www.digi.com/resources/documentation/digidocs/90001525
- the digi micropython guide:
https://www.digi.com/resources/documentation/digidocs/90002219
- micropython libs for xbee: https://github.com/digidotcom/xbee-micropython


### uploading to xbee
- use Digi Xbee Studio
- connect to device, then go to Xbee file system in left pane
- move `main.py` into `/flash`
- move libs like `urequests` and `qwiic_button` into `/flash/lib`
- also move creds into `/flash/lib`
- restart xbee device with button on the devboard
or from the studio: dashboard > device reset
- go to micropython terminal in left pane and view debug output


### device RTC
- you need to set the RTC, here is one way via the micropython repl:

```
>>> import micropython_i2c, qwiic_rtc
>> i2cd = micropython_i2c.MicroPythonI2C()
>>> qrtc = qwiic_rtc.QwiicRTC(address=0x32, i2c_driver=i2cd)
>>> qrtc.set_time(
  seconds=22,
  minutes=53,
  hours=20,
  date=31,
  month=7,
  year=2024,
)
```

- note: you need to use 24hr time format for the hours field
- TODO: weekday is not behaving how I would expect when reading from the RTC


### device button
- for the Qwiic button, there is a 15-item queue maintained by the button itself.
- I thought that the queue would have `millis()` calls inside it (time since boot),
that was based on [the firmware](https://github.com/sparkfun/Qwiic_Button/blob/e89a82fe2ddb293bfe0d6d9f63ccf4782a77c359/Firmware/Qwiic_Button/interrupts.ino#L113),
but it doesn't seem to be the case.
- It seems to have relative times, like the first press will store a near-zero second value
and then subsequent items in the queue will be milliseconds relative to that first press.
- And so then as you pop off values, these relative timings change..
- (and btw there are two queues: "pressed" and "clicked," but we'll just focus on "clicked")


### todos
- device-side
	- qwiic button holds 15 events max, should we
	- qwiic button timestamps in queue will rollover after ~30 days I think? (the millis() rollover problem)
	- switch to using pressed queue instead of clicked
	- handle case when http post succeeds but parsing the response fails
	e.g. "http post: exception: list index out of range"
	- use onboard LED to indicate overall system status
	- event persistence survives device reboot - need a separate eeprom module
	- don't send ping if we sent events recently
	- send memory telemetry: `micropython.mem_info()`
	- sleep the radio (default is "normal mode": the device will not enter sleep;
	see the digi guides for info on micropython execution during sleep)
	- don't block upfront for connectivity
	- don't block indefinitely for anything
	- FSM
	- test with button presses during boot
	- OTA - doable with Digi's "Remote Manager" product, $48/yr
- backend/site
	- improve timezone display on the device page
	- there are some other small time discrepancies;
	like button presses that come in from a few minutes in the future
	- can put the favicon base64 string in kv
