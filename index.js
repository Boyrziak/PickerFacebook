'use strict';

const
    express = require('express'),
    bodyParser = require('body-parser'),
    ngrok = require('ngrok'),
    request = require('request'),
    config = require('config'),
    app = express().use(bodyParser.json());
const ACCESS_TOKEN = config.get('facebook.page.access_token');
app.listen(process.env.PORT || 1337, (err) => {
    if (err) return console.log(`Something bad has happen : ${err}`);
    console.log(`Server listening`);

    ngrok.connect(1337, (err, url) => {
        console.log(`Server publicly acessible at ${url}`);
    });
});

app.get('/', (req, res) => res.send('Hello World!'));


app.post('/webhook', (req, res) => {
    let body = req.body;
    if (body.object === 'page') {
        body.entry.forEach(function (entry) {
            // console.log(entry);
            let webhookEvent = entry.messaging[0];
            let senderPSID = webhookEvent.sender.id;
            console.log('Sender PSID: ' + senderPSID);
            if (webhookEvent.message) {
                handleMessage(senderPSID, webhookEvent.message);
            } else if (webhookEvent.postback) {
                handlePostback(senderPSID, webhookEvent.postback);
            }
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

app.get('/webhook', (req, res) => {
    let VERIFY_TOKEN = config.get('facebook.page.verify_token');
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];
    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('Webhook Verified');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

const handleMessage = (sender_psid, received_message) => {
    let response;
    console.log('Message: ' + received_message.text);
    let test = 'Hello';
    if (received_message.text.toUpperCase() === test.toUpperCase()) {
        response = askTemplate('Which language do you prefer');
        callSendAPI(sender_psid, response);
    }
};

const handlePostback = (sender_psid, received_postback) => {
    let response;
    let payload = received_postback.payload;
    console.log('Postback: ' + payload);
    if (payload === 'GET_STARTED') {
        // response = askTemplate('Are you a Cat or Dog Person');
        response = greetingTemplate('Hello {{user_first_name}}! Morris here! Is English good or would you prefer to chat with us in Arabic?');
        callSendAPI(sender_psid, response);
    }
};

const askTemplate = (text) => {
    return {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "button",
                "text": text,
                "buttons": [
                    {
                        "type": "postback",
                        "title": "Arabic",
                        "payload": "ARABIC_TEXT"
                    },
                    {
                        "type": "postback",
                        "title": "English",
                        "payload": "ENGLISH_TEXT"
                    }
                ]
            }
        }
    }
};

const greetingTemplate = (text) => {
    return {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "button",
                "text": text,
                "buttons": [
                    {
                        "type": "postback",
                        "title": "Yes, English is fine",
                        "payload": "ENGLISH_TEXT"
                    },
                    {
                        "type": "postback",
                        "title": "Let's switch to Arabic",
                        "payload": "ARABIC_TEXT"
                    }
                ]
            }
        }
    }
};

const callSendAPI = (sender_psid, response, cb = null) => {
    // Конструируем тело сообщения
    let request_body = {
        "recipient": {
            "id": sender_psid
        },
        "message": response
    };

    // Отправляем HTTP-запрос к Messenger Platform
    request({
        "uri": "https://graph.facebook.com/v2.6/me/messages",
        "qs": {"access_token": ACCESS_TOKEN},
        "method": "POST",
        "json": request_body
    }, (err, res, body) => {
        if (!err) {
            if (cb) {
                cb();
            }
        } else {
            console.error("Unable to send message:" + err);
        }
    });
};