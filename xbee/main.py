import time

from machine import Pin
import urequests
import usocket

led = Pin("D4", Pin.OUT)
url = "https://whenpress.matt-ball-2.workers.dev/sage"
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
