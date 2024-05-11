### local dev
- have to run `wrangler dev` in a separate tab,
or specify `--local` in your `wrangler commands`,
e.g. if you're `put`ting a key into KV


### micropython
- seems that the module must be named `main.py`
- getting started guide with all the right settings:
https://cdn.sparkfun.com/assets/f/2/a/2/5/OEM__Digi__recommended_getting_started_guide_-_Xbee_Cellular1.pdf
- have to put `urequests` in lib (also have to fix serf typo..need to submit a change against their repo)
