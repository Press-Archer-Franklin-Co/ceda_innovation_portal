# WhatsApp through Twilio

People message the CEDA WhatsApp number, walk through a journey that staff built in **Channels > WhatsApp flows**, can send photos and documents, and end with an idea sent to CEDA. Staff see it in the review queue like any other idea.

Everything here is set in the staff console. There are no Twilio keys in code, environment files or seeds.

## What the webhook does

Twilio posts every incoming WhatsApp message to the connection's webhook address:

`https://<your site>/api/channels/whatsapp/<token>/` (method POST, keep the trailing slash)

For each message the portal:

1. **Checks the X-Twilio-Signature** with the connection's Auth token. Twilio signs the exact address it called, so the portal checks both the address of the request and the address shown on the connection (behind Cloudflare and nginx these can differ). Anything else is refused with 403 and written to the `security.webhook` log as `twilio_signature_mismatch` (never the signature itself).
2. **Skips a message it has already handled** (same MessageSid within 24 hours). Twilio sends a message again when an answer is slow.
3. **Finds the person** from `From` (`whatsapp:+267...`, kept as +267...). A number that belongs to a registered person is matched to their account. Their WhatsApp profile name is kept as `{profile_name}` for the journey. Messages from the connection's own number are ignored.
4. **Runs the journey** the connection is set to: starts it, or continues the person's open session (it stays open 24 hours). If the whole message is one of the connection's restart words (for example "menu"), the journey starts again from the top.
5. **Replies through Twilio's REST API**, and answers the webhook itself with an empty TwiML `<Response></Response>` (text/xml). Even when something fails inside, Twilio gets 200 and the person gets the friendly error reply; only an unknown address or a bad signature is refused.

Each message writes one line to the `apps.channels.whatsapp` log: connection, masked number, MessageSid, step reached, outcome and time. Failed sends log Twilio's error code (for example 63016: outside the 24 hour window). Message text, file contents, full numbers and keys are never logged.

## Connection settings (Channels > WhatsApp card > Connections)

| Setting | What it does |
| --- | --- |
| Account SID, Auth token | From the Twilio console. The token is stored encrypted and never shown again; an empty box keeps it. |
| WhatsApp sender number | +14155238886 for the Sandbox, or your own WhatsApp sender. |
| How choices are sent | **WhatsApp buttons and lists** (default): up to 3 choices as quick reply buttons, 4 to 10 as a list, made through Twilio's Content API. Titles are cut at a word to 20 characters (buttons) or 24 (list rows). More than 10 choices, or a refusal from Twilio, goes as numbered text. **Numbered text** is the other option. |
| Words that start again | One per line. Defaults: menu, start, restart, simolola, lenane. |
| Standard replies | The replies the system sends, in English (`.en`) and Setswana (`.tn`): `error`, `not_available`, `file_not_expected`. |
| Approved message templates | Template (Content SID) per message type, for messages sent more than 24 hours after the person last wrote. |

**Changing keys:** open the connection, press Change settings, enter the new Account SID, token or sender number, then Test and Activate. The new keys are used from the next message, with no restart, and the webhook address and the journey stay the same.

**Several connections:** for example "Twilio Sandbox" and "Twilio production". Each has its own webhook address; only active ones answer, and an inactive one replies "This service is not available yet". A staff reply from the Inbox goes out on the connection of the person's latest session.

**Test** shows: settings complete, Twilio accepted the Account SID and token, the sender number (it says "Sandbox number" for +14155238886, or looks the number up on the account), missing templates, and an optional test message to a number you type.

## Journey steps added for WhatsApp

Both appear in the WhatsApp flows builder (and the USSD builder) without any screen change.

**Ask for a file** (`file`): asks for a photo or document and saves it on the person's idea draft, through the same checks and storage as a website upload (file type, content check, sha256, audit log). Settings: the text, the form field it belongs to, the file types accepted (default: the website's list), most files, largest file in MB, whether a file is needed, the words that skip or finish the step (English and Setswana, comma between them), and the replies for a received file, a wrong type, a file that is too big, a file that is needed, and a file that could not be saved. It must come after a **Save to an idea draft** step; publishing is refused otherwise. On USSD it is skipped. A file sent at any other step is ignored with the `file_not_expected` reply; the text of that message is still used.

**Send the idea** (`submit`): sends the draft to CEDA, as a guest (with the verified number and the name answer) or as the matched account, following the challenge's rules. Settings: ask the person to agree first (and the question), where the name comes from, and the messages for sent (`{reference}` is the idea number), not agreed, challenge closed and could not send, plus where to go next when it is sent or not. Each sent idea writes the audit entry `channel_submission_created`. In the phone simulator it checks everything but does not send: test runs never create real ideas.

The example WhatsApp journey now asks, after "Save idea", for an optional photo or document (reply SKIP) and then sends the idea and gives its number.

**Ask the form's questions** (`form_questions`): reads the challenge's live form and asks each question in the person's language: text, long text, number, email, date, single choice, yes or no, multiple choice (numbers with commas) and files. It skips hidden questions, checks answers with the form's rules and saves each one in the draft under its field key. BACK goes to the previous question; SKIP leaves out one that is not needed. It makes the draft itself when there is none, so a Save to an idea draft step before it is not needed; a Send the idea step must come after it. A question a phone cannot ask is listed at the end with a link. If that question is required, the idea stays saved and the person finishes it on the website, without being asked to agree to a send that cannot work.

**Show my ideas** (`my_ideas`): lists the open ideas of the person's account and of this phone as a guest, newest first (up to 9, plus Recent ideas, which shows the last 5). Picking one shows its name, status, last update and next step, with Continue this idea for a draft. Typing an idea number still works. It never shows another person's idea, notes or reviewer names. In the simulator it uses sample ideas.

The phone simulator saves nothing: no draft, account, file or idea.

**Upgrading the example journey:** `python manage.py upgrade_example_whatsapp_journey` adds these steps to the journey live WhatsApp connections run, publishes a new version and prints what changed. Running it again changes nothing. `--undo` puts back the version from before.

## Set up the Twilio WhatsApp Sandbox

1. In the staff console: **Channels**, the **WhatsApp** card, **Add WhatsApp number**. Provider "Twilio WhatsApp", name "Twilio Sandbox", sender +14155238886, journey "CEDA Innovation (WhatsApp)". Next.
2. Enter the Account SID and Auth token from the Twilio console. Save and test, Run test, then Activate. Copy the webhook address shown on the connection.
3. Make sure **WhatsApp messages** is switched on in Platform settings > Features.
4. In the Twilio Console: Messaging, Try it out, Send a WhatsApp message, **Sandbox settings** tab. Paste the webhook address into "When a message comes in", method **POST**, Save.
5. From a phone, send `join <your code>` (shown on that Twilio page) to +1 415 523 8886, then send `Hi`.

To move to production later, add a second connection with the production sender and keys (or change the keys on this one), test, activate it, and point the production sender's webhook at its address.
