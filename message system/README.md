# MessageFlow — Chat Message Producer–Consumer Simulation

Open `index.html` in a browser to run the simulation.

- Chat senders produce messages and place them in the bounded server queue.
- Recipients consume messages from the queue.
- Configure starting messages, queue capacity, waiting recipients, total recipient requests, and burst size.
- Enable concurrent arrivals to send several recipient requests together.
- Start the automatic message flow, or use the manual send and deliver controls.
- Turn on race condition mode to show unsynchronized access to the shared queue.
