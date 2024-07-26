"""WhenPress device.

Target is Sparkfun's Xbee LTE-M/NB-IOT dev kit
with an attached Sparkfun qwiic button.

1. when button is pressed, store timestamp.
2. periodically send all stored events to cloud.
3. periodically send a ping to the cloud.
"""

import time

import machine
import ujson
import usocket

# Use digi studio to copy lib/* -> /flash/lib/
import credentials
import micropython_i2c
import qwiic_button
import urequests


print(
    """
                   __
         _      __/ /_  ___  ____  ____  ________  __________
        | | /| / / __ \/ _ \/ __ \/ __ \/ ___/ _ \/ ___/ ___/
        | |/ |/ / / / /  __/ / / / /_/ / /  /  __(__  |__  )
        |__/|__/_/ /_/\___/_/ /_/ .___/_/   \___/____/____/
                               /_/
      """
)

# Start qwiic button.
# We want to init this asap so we can start capturing button presses.
xbee_mp_driver = micropython_i2c.MicroPythonI2C()
qbutton = qwiic_button.QwiicButton(address=None, i2c_driver=xbee_mp_driver)
print("qwiic button: starting.")
while not qbutton.begin():
    print("qwiic button: failed to init, retrying..")
    time.sleep(5)
ticks_since_qbutton_start = time.ticks_ms()
print("qwiic button: ready.")
print("qwiic button: fw version: " + str(qbutton.get_firmware_version()))
time.sleep(0.1)  # Give the i2c bus a break.
qbutton.LED_on(brightness=50)

led = machine.Pin("D4", machine.Pin.OUT)
button = machine.Pin("D0", machine.Pin.IN, machine.Pin.PULL_UP)

base_url = "https://whenpress.matt-ball-2.workers.dev"
headers = {"Content-Type": "application/json"}

PING_PERIOD = 5 * 60


def is_radio_connected():
    try:
        usocket.getaddrinfo("8.8.8.8", 53)
        return True
    except:
        return False


# Wait for connectivity.
# The Xbee retrieves local time from the cell network.
# Using this in isolation is not ideal --
# we might want to record a button press before we've established connectivity.
# TODO: leverage "time since last reset" in combination with network time.
while True:
    if is_radio_connected():
        print("network connection: ready.")
        break
    else:
        print("network connection: waiting..")
        time.sleep(5)

# Wait for clock setup.
# I believe the cell modem needs to connect and bootstrap the Xbee's clock.
# The time.tz_offset method fails unless you wait about 15s after boot.
while True:
    try:
        time.tz_offset()
        print("clock boostrap: ready.")
        break
    except OSError:
        print("clock bootstrap: waiting..")
        time.sleep(5)

# Determine the qbutton start timestamp.
# Now that the cell radio has provided localtime, we can convert from time-since-boot to time-since epoch.
ticks_since_boot = time.ticks_ms()
qbutton_start_time = (
    time.mktime(time.localtime())
    - ticks_since_boot / 1000.0
    + ticks_since_qbutton_start / 1000.0
)

# Xbee uses 1/1/2000 as epoch start instead of 1/1/1970.
# To create a more typical UTC timestamp indexed from 1970,
# we can add the delta in seconds and the tzoffset.
EPOCH_DIFFERENCE = 946684800 + time.tz_offset()
button_being_pressed = False
events = []
last_ping = -PING_PERIOD * 1000  # init so the ping triggers on boot

# Main loop.
print("whenpress: ready.")
while True:
    # Check for button presses on devboard button.
    if button.value() == 0:  # when pressed, button is pulled low
        if not button_being_pressed:
            events.append({"pressTimestamp": time.time() + EPOCH_DIFFERENCE})
            button_being_pressed = True
            led.toggle()
    else:
        button_being_pressed = False

    # Check for button presses on qwiic button.
    try:
        while not qbutton.is_clicked_queue_empty():
            qbutton_timer_value = qbutton.pop_clicked_queue() / 1000.0
            events.append(
                {
                    "pressTimestamp": (
                        qbutton_start_time + qbutton_timer_value + EPOCH_DIFFERENCE
                    )
                }
            )
    except OSError as e:
        print("qbutton: error: " + str(e))

    # Transmit any events.
    successful_indices = []
    if events:
        print("events to transmit: %s" % len(events))
        for index, event in enumerate(events):
            print("sending event #%s" % index)
            data = {
                "password": credentials.password,
                "pressTimestamp": event["pressTimestamp"],
            }
            # TODO: likely to hit exceptions here..
            # e.g.
            #  - OSError: [Errno 7111] ECONNREFUSED
            #  - OSError: [Errno 7110] ETIMEDOUT
            response = urequests.post(
                base_url + "/" + credentials.device_name + "/data",
                headers=headers,
                data=ujson.dumps(data),
            )
            if response.status_code == 200:
                print("successfully sent event #%s" % index)
                successful_indices.append(index)
            else:
                print("failed to send event #%s" % index)
                print("response status code: %s" % response.status_code)
                print("response reason: %s" % response.reason)
                print("response text: %s" % response.text)
    # Clear out events that we succesfully sent.
    for index in successful_indices:
        del events[index]

    # Periodically send a ping.
    if time.ticks_diff(time.ticks_ms(), last_ping) > (PING_PERIOD * 1000):
        print("ping: sending")
        data = {
            "password": credentials.password,
        }
        # TODO: likely to hit exceptions here..
        response = urequests.post(
            base_url + "/" + credentials.device_name + "/ping",
            headers=headers,
            data=ujson.dumps(data),
        )
        if response.status_code == 200:
            print("ping: success")
        else:
            print("ping: failed")
            print("ping: response status code: %s" % response.status_code)
            print("ping: response reason: %s" % response.reason)
            print("ping: response text: %s" % response.text)
        last_ping = time.ticks_ms()

    # Pause to give the i2c bus a rest.
    time.sleep(0.1)
