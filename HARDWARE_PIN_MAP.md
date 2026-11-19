# Hardware pin map

| Module | Signal | Arduino Nano 33 IoT |
|---|---|---|
| Servo 1 | Signal | D2 |
| Servo 2 | Signal | D3 |
| Servo 3 | Signal | D4 |
| Servo 4 | Signal | D5 |
| MFRC522 | SS | D8 |
| MFRC522 | RST | D7 |
| MFRC522 | MOSI | D11 |
| MFRC522 | MISO | D12 |
| MFRC522 | SCK | D13 |
| MFRC522 | VCC | 3.3V |
| OLED | SDA/SCL | I2C pins |

Servo neutral angles in the final firmware are 90, 90, 90 and 0 degrees for servo 1 through servo 4. Active angles are 0, 0, 0 and 90 degrees respectively. Test these values with the mechanical linkage disconnected before installation.

Servo power comes from a separate regulated 5V supply. Join the supply ground to Arduino ground. Confirm the exact servo voltage and current requirements before connecting the adapter.
