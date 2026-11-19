# MediTrack Source Code

This folder contains the source files recovered from the available MediTrack project package, plus the latest final Arduino firmware file found in the project files.

## Folder structure

- 01_Arduino/Firmware: Arduino Nano 33 IoT firmware.
- 02_Website: website interface, browser JavaScript, CSS, Vercel configuration and API endpoints.
- 02_Website/.env.example: environment variable template.
- 03_Database/Supabase: SQL schema for patient profiles and dose records.
- 04_Documentation: wiring, setup and implementation notes.

## Important implementation scope

The final firmware included here implements MFRC522 RFID card identification, four servo motors, an SH1106 OLED, WiFiNINA connectivity and HTTPS requests to the Vercel website. The website backend validates registered RFID UIDs, checks the configured time window and records dispensing events in Supabase.

A fingerprint sensor implementation was not present in the available final firmware or website source files. I have not added a made-up fingerprint driver or pretended biometric identification is implemented. This package is therefore the available RFID based implementation. A fingerprint module will need its exact model, library and wiring before its code can be added accurately.

## Arduino setup

1. Open 01_Arduino/Firmware/MediTrack_Nano33IoT.ino in Arduino IDE.
2. Install the libraries listed in LIBRARIES.txt.
3. Set WIFI_SSID, WIFI_PASSWORD and DEVICE_TOKEN in the sketch.
4. Check API_HOST against the deployed Vercel project.
5. Upload to an Arduino Nano 33 IoT.

The firmware also contains the two registered card UID constants. If different cards are used, update PATIENT1_UID and PATIENT2_UID in the sketch and save the same values in the corresponding Supabase patient profiles.

The firmware uses these connections:

| Part | Connection |
|---|---|
| Patient 1 morning servo | D2 |
| Patient 1 evening servo | D3 |
| Patient 2 morning servo | D4 |
| Patient 2 evening servo | D5 |
| MFRC522 SS | D8 |
| MFRC522 RST | D7 |
| MFRC522 MOSI | D11 |
| MFRC522 MISO | D12 |
| MFRC522 SCK | D13 |
| OLED | I2C SDA and SCL |

The MFRC522 uses 3.3V. The servo motors use a separate regulated 5V supply sized for their current requirements. Connect the servo supply ground to Arduino ground. Do not power the four servos from the Arduino board.

## Website setup

1. Deploy the 02_Website folder as the Vercel project root.
2. Add the environment variables from .env.example in the Vercel project settings.
3. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEVICE_TOKEN, CRON_SECRET, NTFY_TOPIC and APP_TIMEZONE with the values for the project.
4. Run 03_Database/Supabase/schema.sql in the Supabase SQL Editor.
5. In 02_Website/app.js, set the public Supabase project URL and publishable or anon key. Never put the service role key in browser code.
6. Configure the two patient profiles and RFID UIDs in the website settings.
7. Redeploy after environment changes.

Do not commit real WiFi credentials, device tokens, Supabase service role keys, private notification topics or real patient details to a public repository.

## Dose handling

The server is authoritative for the time and checks whether the patient has a dose inside the configured morning or evening window. It rejects unknown RFID cards, scans outside the permitted time window and duplicate dose records. An approved scan selects one servo. The firmware moves it to its calibrated active position for 10 seconds and returns it to neutral, then reports completion.

## Safety and limitations

This is a prototype, not a certified medical device. RFID identification and a servo movement cannot prove that a patient swallowed medicine. Do not use it as the sole medication management method. Test the mechanism, power supply, security, network loss and failure handling with no medicine before any practical use. Keep a manual backup process and follow healthcare professional instructions for missed doses.
