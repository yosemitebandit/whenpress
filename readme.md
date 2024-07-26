a small button that tracks when it has been pressed

- `device/` contains code (micropython) for a simple device: button, RTC and a radio (currently xbee)
- the rest is a webapp (ts) for receiving device data, storing it and rendering device history
- uses cloudflare kv and cf workers


### setup and using wrangler
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
- the xbee getting started guide with all the right settings:
https://cdn.sparkfun.com/assets/f/2/a/2/5/OEM__Digi__recommended_getting_started_guide_-_Xbee_Cellular1.pdf
- the digi micropython guide:
https://www.digi.com/resources/documentation/digidocs/90002219
- the micropython guide as a pdf:
https://www.digi.com/resources/documentation/digidocs/PDFs/90002219.pdf
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


### todos
- device-side
	- fix event queue handling in device code
	- remove old button code
	- need error handling in so many places...network and i2c are flaking out nonstop
	- look at button's queue handling..
	  - I think it's only 15 events max and how does it do the timing exactly
	  - see [here](https://github.com/sparkfun/Qwiic_Button/blob/master/Firmware/Qwiic_Button/Qwiic_Button.ino)
    - try adafruit-ampy
	- use onboard LED to indicate overall system status
	- use external RTC
	- event persistence survives device reboot
	- don't send ping if we sent events recently
	- send battery info
	- sleep the radio
	- don't block upfront for connectivity
	- don't block indefinitely for anything
- backend/site
	- improve timezone display on the device page
	- can put the favicon base64 string in kv
