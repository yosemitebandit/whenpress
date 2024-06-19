"""WhenPress device.

1. When button is pressed, (TODO) store timestamp.
2. Periodically send all stored events to cloud.
3. TODO: Periodically send a ping to the cloud if there are no events.

potential optimizations
- use qwiic button
- use external rtc
- event persistence survives device reboot
- don't send ping if we sent events recently
- send battery info
"""

import time

import machine
import ujson
import urequests
import usocket

import credentials  # cp device/credentials.py -> lib/

print("whenpress: booting.")

led = machine.Pin("D4", machine.Pin.OUT)
button = machine.Pin("D0", machine.Pin.IN, machine.Pin.PULL_UP)

base_url = "https://whenpress.matt-ball-2.workers.dev"
headers = {"Content-Type": "application/json"}


def is_connected():
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
    if is_connected():
        print("cell network connection: ready.")
        break
    else:
        print("cell network connection: waiting..")
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

# Xbee uses 1/1/2000 as epoch.
# We can add this value and the tzoffset to create a UTC timestamp.
epoch_difference = 946684800 + time.tz_offset()
button_being_pressed = False
events = []


# Main loop.
print("whenpress: ready.")
while True:
    # Check for button presses on devboard button.
    if button.value() == 0:  # when pressed, button is pulled low
        if not button_being_pressed:
            events.append({"pressTimestamp": time.time() + epoch_difference})
            button_being_pressed = True
            led.toggle()
    else:
        button_being_pressed = False

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
