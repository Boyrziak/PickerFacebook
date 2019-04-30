'use strict';

const
    express = require('express'),
    bodyParser = require('body-parser'),
    validator = require('email-validator'),
    request = require('request'),
    config = require('config'),
    path = require('path'),
    url = require('url'),
    fs = require('fs'),
    app = express().use(bodyParser.json()),
    ACCESS_TOKEN = config.get('facebook.page.access_token'),
    FACEBOOK_URI = config.get('facebook.page.uri');

app.use(express.static(path.join(__dirname, 'public')));

app.listen(process.env.PORT || 1337, (err, req, res) => {
    if (err) return console.log(`Something bad has happen : ${err}`);
    console.log(`Server listening`);
    let ngrok = require('ngrok');
    ngrok.connect(1337, (err, url) => {
        console.log(`Server publicly acessible at ${url}`);
    });
});

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.get('*', (req, res) => {
    console.log(req.path);
    if (req.path !== '/favicon.ico') {
        let file = path.join(__dirname, req.path);
        console.log(file + '.png');
        let stream = fs.createReadStream(file + '.png');
        stream.on('open', () => {
            res.set('Content-Type', 'image/png');
            stream.pipe(res);
        });
    }
});



app.post('/webhook', (req, res) => {
    let body = req.body;
    if (body.object === 'page') {
        body.entry.forEach(function (entry) {
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
        response = messageTemplate('I did not understand that');
        callSendAPI(sender_psid, response);
    }
};

const handlePostback = (sender_psid, received_postback) => {
    let response;
    let payload = received_postback.payload;
    let model;
    let result = /(\w+)(quote)/gi.exec(payload)
    if(result) {
        payload = result[2];
        model = result[1];
    }
    let name = 'User';
    switch (payload) {
        case 'GET_STARTED':
            request({
                "uri": "https://graph.facebook.com/" + sender_psid,
                "qs": {
                    "fields": "first_name",
                    "access_token": ACCESS_TOKEN
                },
                "method": "GET",
            }, (err, res, body) => {
                if (!err) {
                    let result = JSON.parse(body);
                    name = result.first_name;
                    let buttons = generateButtons([{
                        title: "Yes, English is fine",
                        payload: "ENGLISH_TEXT"
                    }, {title: "Let's switch to Arabic", payload: "ARABIC_TEXT"}]);
                    response = askTemplate('Hello ' + name + '! Morris here! Is English good or would you prefer to chat with us in Arabic?', buttons);
                    callSendAPI(sender_psid, response);
                }
            });
            break;
        case 'ENGLISH_TEXT':
            let buttons = generateButtons([{
                title: 'Discover MG',
                payload: 'DISCOVER'
            }, {title: 'After sales', payload: 'AFTER_SALES'}]);
            response = askTemplate('Great, now what would you like to talk about today?', buttons);
            callSendAPI(sender_psid, response);
            break;
        case 'DISCOVER':
            response = sliderTemplate();
            callSendAPI(sender_psid, response);
            break;
        case 'QUOTE':
            response = messageTemplate('Nice choice the ' + model);
            callSendAPI(sender_psid, response);
            let second_response = fileTemplate('https://67adf7b6.ngrok.io/img/'+model);
            callSendAPI(sender_psid, second_response);
            let dealerButtons = generateButtons([{title: 'Dubai', payload: 'CITY_DUBAI'},{title: 'Abu Dhabi', payload: 'CITY_ABU'},{title: 'Ras Al Khaimah', payload: 'CITY_KHAIMAH'},{title: 'Fujairah', payload: 'CITY_FUJAIRAHAN'},{title: 'Ajman', payload: 'CITY_AJMAN'}]);
            let third_response = askTemplate('Which dealership is the most convenient for you?', dealerButtons);
            callSendAPI(sender_psid, third_response);
            break;
    }
};

const generateButtons = (options) => {
  let buttons = [];
  options.forEach((option) => {
     let button = {
       "type": "postback",
       "title": option.title,
       "payload": option.payload
     };
     buttons.push(button);
  });
  return buttons;
};

const askTemplate = (text, buttons) => {
    return {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "button",
                "text": text,
                "buttons": buttons
            }
        }
    }
};

const messageTemplate = (text) => {
    return {
        "text": text
    }
};

const sliderTemplate = () => {
    console.log('Slider template');
    return require('./fb_carousel');
};

const fileTemplate = (file) => {
    return {
        "attachment" : {
            "type" : "image",
            "payload" : {
                "is_reusable": false,
                "url": file
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
        "uri": FACEBOOK_URI,
        "qs": {"access_token": ACCESS_TOKEN},
        "method": "POST",
        "json": request_body
    }, (err, res, body) => {
        if (!err) {
            if (cb) {
                cb();
            }
            console.log(body);
        } else {
            console.error("Unable to send message:" + err);
        }
    });
};