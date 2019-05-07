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
    let regExp = /(\w*).(png)/g;
    let requestExt = regExp.exec(req.path);
    if (requestExt) {
        console.log(requestExt);
        if (requestExt[2] === 'png') {
            let file = path.join(__dirname, req.path);
            console.log(file);
            let stream = fs.createReadStream(file);
            stream.on('error', (err) => {
                console.log(`Something bad has happen : ${err}`);
                res.send('No such file');
            });
            stream.on('open', () => {
                res.set('Content-Type', 'image/' + requestExt[2]);
                stream.pipe(res);
            });
        }
    } else if (req.path === '/webhook') {
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
    }
});


app.post('/webhook', (req, res) => {
    let body = req.body;
    if (body.object === 'page') {
        body.entry.forEach(function (entry) {
            let webhookEvent = entry.messaging[0];
            let senderPSID = webhookEvent.sender.id;
            // console.log('Sender PSID: ' + senderPSID);
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
    typingSendAPI(sender_psid, 'typing_on');
    console.log('Message: ' + received_message.text);
    let regExp = /\+\d/;
    let result;
    if (received_message.text) {
        result = received_message.text.match(regExp);
    }
    if (result && result[0].length > 0) {
        response = messageTemplate('Thanks for your request, one of our MG Experts will get in touch with you during working hours. Have a great day!');
        callSendAPI(sender_psid, response);
        return;
    }
    if (validator.validate(received_message.text)) {
        response = messageTemplate('One last question, what is your phone number(please include the country code ex: +977880009)');
    } else {
        response = messageTemplate('I did not understand that');
    }
    callSendAPI(sender_psid, response);
    typingSendAPI(sender_psid, 'typing_off');
};

const handlePostback = (sender_psid, received_postback) => {
    let response;
    typingSendAPI(sender_psid, 'typing_on');
    let payload = received_postback.payload;
    console.log(payload);
    let model;
    let result = /(\w+)(quote)/gi.exec(payload);
    let timer;
    if (result) {
        payload = result[2];
        model = result[1];
    }
    let name = 'User';
    const config = require('config');
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
            // response = sliderTemplate();
            let models = config.get('facebook.data.models');
            let modelSlides = [];
            models.forEach((model) => {
                let buttonsObjects = [];
                model.buttons.forEach((button) => {
                    buttonsObjects.push(button);
                });
                let modelButtons = generateButtons(buttonsObjects);
                let modelSlide = generateSlide({
                    "title": model.title,
                    "subtitle": model.subtitle,
                    "img": 'https://a5f0faa0.ngrok.io/' + model.title + '.png'
                }, modelButtons);
                modelSlides.push(modelSlide);
            });
            response = generatedSliderTemplate(modelSlides);
            callSendAPI(sender_psid, response);
            timer = setTimeout(()=>{
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
                        let helperButtons = generateButtons([{
                            'title': 'Showroom locations',
                            'payload': 'SHOWROOM_LOCATION'
                        }, {'title': 'Other', 'payload': 'Other'}]);
                        let helperResponce = askTemplate("Did you find what you're looking for " + name + '? If not, can I help you with anything else?', helperButtons);
                        callSendAPI(sender_psid, helperResponce);
                    }
                });
            }, 5000);
            break;
        case 'QUOTE':
            response = messageTemplate('Nice choice the ' + model);
            callSendAPI(sender_psid, response);
            let second_response = fileTemplate('https://a5f0faa0.ngrok.io/img/' + model + '.png');
            callSendAPI(sender_psid, second_response);
            setTimeout(() => {
                let third_response = messageTemplate('Which dealership is the most convenient for you?');
                callSendAPI(sender_psid, third_response);
                let countries = config.get('facebook.data.countries');
                let countrySlides = [];
                countries.forEach((country) => {
                    let citiesObjects = [];
                    if (country.cities.length <= 3) {
                        country.cities.forEach((city) => {
                            citiesObjects.push({"title": city.title, "payload": city.title});
                        });
                    } else if (country.cities.length > 3) {
                        for (let i = 0; i < 2; i++) {
                            citiesObjects.push({"title": country.cities[i].title, "payload": country.cities[i].title});
                        }
                        citiesObjects.push({"title": "Other", "payload": country.title + '_other'});
                    }
                    let citiesButtons = generateButtons(citiesObjects);
                    let countrySlide = generateSlide({"title": country.title}, citiesButtons);
                    countrySlides.push(countrySlide);
                });
                let fourth_response = generatedSliderTemplate(countrySlides);
                callSendAPI(sender_psid, fourth_response);
            }, 2000);
            break;
        case 'SHOWROOM_LOCATION':
            let countries = config.get('facebook.data.countries');
            let countrySlides = [];
            countries.forEach((country) => {
                let citiesObjects = [];
                if (country.cities.length <= 3) {
                    country.cities.forEach((city) => {
                        citiesObjects.push({"title": city.title, "payload": city.title});
                    });
                } else if (country.cities.length > 3) {
                    for (let i = 0; i < 2; i++) {
                        citiesObjects.push({"title": country.cities[i].title, "payload": country.cities[i].title});
                    }
                    citiesObjects.push({"title": "Other", "payload": country.title + '_other'});
                }
                let citiesButtons = generateButtons(citiesObjects);
                let countrySlide = generateSlide({"title": country.title}, citiesButtons);
                countrySlides.push(countrySlide);
            });
            let fourth_response = generatedSliderTemplate(countrySlides);
            callSendAPI(sender_psid, fourth_response);
            break;
        default:
            response = messageTemplate('Nice, let me grab some contact details. What is your email?');
            callSendAPI(sender_psid, response);
            break;
    }
    typingSendAPI(sender_psid, 'typing_off');
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

const generateSlide = (options, buttons) => {
    return {
        "title": options.title,
        "image_url": options.img,
        "subtitle": options.subtitle,
        "buttons": buttons
    }
};

const generatedSliderTemplate = (slides) => {
    return {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": slides
            }
        }
    }
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


const fileTemplate = (file) => {
    return {
        "attachment": {
            "type": "image",
            "payload": {
                "is_reusable": false,
                "url": file
            }
        }
    }
};

const listTemplate = (text) => {
  return {
      "attachment": {
          "type": "template",
          "payload": {
              "template_type": "list",
              "top_element_style": "full",
              "elements": require('fb_list')
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

const typingSendAPI = (sender_psid, typing, cb = null) => {
    // Конструируем тело сообщения
    let request_body = {
        "recipient": {
            "id": sender_psid
        },
        "sender_action": typing
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