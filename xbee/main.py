"""WhenPress device.

1. When button is pressed, store timestamp from RTC.
2. Periodically send all stored events to cloud.
3. Periodically send a ping to the cloud if there are no events.

potential optimizations
- event persistence survives device reboot
- don't send ping if we sent events recently
- send battery info
"""
import time

from machine import Pin
import urequests
import usocket

led = Pin("D4", Pin.OUT)
url = "https://whenpress.matt-ball-2.workers.dev/sage/ping"
headers = {"Content-Type": "application/json"}
data = {}


def is_connected():
    try:
        usocket.getaddrinfo("8.8.8.8", 53)
        return True
    except:
        return False


while True:
    while not is_connected():
        print("awaiting connection..")
        time.sleep(5)

    print("posting")
    led.on()
    response = urequests.post(url, headers=headers, data=data)
    print(response.text)
    print("waiting")
    led.off()
    time.sleep(30)
