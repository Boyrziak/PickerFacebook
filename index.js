'use strict';

const
    express = require('express'),
    bodyParser = require('body-parser'),
    // validator = require('email-validator'),
    request = require('request'),
    config = require('config'),
    path = require('path'),
    // url = require('url'),
    fs = require('fs'),
    app = express().use(bodyParser.json()),
    ACCESS_TOKEN = config.get('facebook.page.access_token'),
    port = 1337,
    FACEBOOK_URI = config.get('facebook.page.uri');

let currentUrl;
let currentUser = 1069;
let dishesList;
let winesList;
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '../www')));

app.listen(port, (err, req, res) => {
    if (err) return console.log(`Something bad has happen : ${err}`);
    console.log(`Server listening at port ${port}`);
});

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.get('/about', function (request, response) {
    response.send('About Us');
});

app.get(/(\w)*\.(\w)*/i, (req, res) => {
    if (req.path !== '/APITest') {
        res.sendFile(path.join(__dirname + req.path));
    }
});

// app.get(/(\w*)\.(\w*)/i, (req, res) => {
//     console.log(`Path ${req.path}`);
//     let requestExt = req.path;
//     if (requestExt) {
//         console.log(requestExt);
//         if (requestExt[2] === 'png' || requestExt[2] === 'jpg') {
//             let file = path.join(__dirname, req.path);
//             let stream = fs.createReadStream(file);
//             stream.on('error', (err) => {
//                 console.log(`Something bad has happen : ${err}`);
//                 res.send('No such file');
//             });
//             stream.on('open', () => {
//                 res.set('Content-Type', 'image/' + requestExt[2]);
//                 stream.pipe(res);
//             });
//         }
//     }
// });


app.post('/webhook', (req, res) => {
    let body = req.body;
    currentUrl = req.protocol + 's://' + req.get('host');
    if (body.object === 'page') {
        body.entry.forEach(function (entry) {
            let webhookEvent = entry.messaging[0];
            let senderPSID = webhookEvent.sender.id;
            request({
                "uri": "https://graph.facebook.com/" + senderPSID,
                "qs": {
                    "fields": "first_name",
                    "access_token": ACCESS_TOKEN
                },
                "method": "GET",
            }, (err, res, body) => {
                if (!err) {
                    let result = JSON.parse(body);
                    currentUser = result.id;
                    console.log(`Current User: ${currentUser}`);
                } else {
                    console.log('Error getting User ID: ' + err);
                }

                if (webhookEvent.message) {
                    handleMessage(senderPSID, webhookEvent.message);
                } else if (webhookEvent.postback) {
                    handlePostback(senderPSID, webhookEvent.postback);
                }
            });
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

app.get('/dishesList', (req, res) => {
    if (dishesList) {
        res.status(200).send(dishesList);
    } else {
        res.sendStatus(400);
    }
});

app.get('/dishesView', (req, res) => {
    console.log(`Path: ${req.path}`);
    let referer = req.header('Referer');
    console.log(`Referer: ${referer}`);
    if (referer) {
        if (referer.indexOf('www.messenger.com') >= 0) {
            res.setHeader('X-Frame-Options', 'ALLOW-FROM https://www.messenger.com/');
        } else if (referer.indexOf('www.facebook.com') >= 0) {
            res.setHeader('X-Frame-Options', 'ALLOW-FROM https://www.facebook.com/');
        }
        res.sendFile(path.join(__dirname + '/web_views/dishes_list.html'));
    }
});

app.get('/dishSelected', (req, res) => {
    let body = req.query;
    let response = messageTemplate(`Dish selected: ${body.dish}`);
    res.status(200).send('Please close this window to return to the conversation');
    callSendAPI(body.psid, response);
    callNodeRed(body.dish, body.psid, false);
});

app.get('/winesList', (req, res) => {
    if (winesList) {
        res.status(200).send(winesList);
    } else {
        res.sendStatus(400);
    }
});

app.get('/carouselView', (req, res) => {
    console.log(`Path: ${req.path}`);
    let referer = req.header('Referer');
    console.log(`Referer: ${referer}`);
    if (referer) {
        if (referer.indexOf('www.messenger.com') >= 0) {
            res.setHeader('X-Frame-Options', 'ALLOW-FROM https://www.messenger.com/');
        } else if (referer.indexOf('www.facebook.com') >= 0) {
            res.setHeader('X-Frame-Options', 'ALLOW-FROM https://www.facebook.com/');
        }
        res.sendFile(path.join(__dirname + '/web_views/wines_carousel.html'));
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
    callNodeRed(received_message.text, sender_psid, false);
};

const handlePostback = (sender_psid, received_postback) => {
    let response;
    let payload = received_postback.payload;
    console.log(`Button payload: ${payload}`);
    let buttonResult = /(BUTTON)_([\w\s]*\?)/.exec(payload);
    let buttonText;
    if (buttonResult) {
        payload = buttonResult[1];
        buttonText = buttonResult[2];
    }
    switch (payload) {
        case 'GET_STARTED':
            callNodeRed('Hello', sender_psid, false);
            break;
        case 'BUTTON':
            callNodeRed(buttonText, sender_psid, false);
            break;
    }
};

const sendMessage = (sender_psid, jsonData) => {
    let response;
    console.log('Data type: ' + jsonData.type);
    switch (jsonData.type) {
        case 'other':
            jsonData.response.forEach(function (step, index) {
                typingSendAPI(sender_psid, 'typing_on');
                if (step.response_type === 'text' && step.text) {
                    response = messageTemplate(step.text);
                    callSendAPI(sender_psid, response);
                } else if (step.response_type === 'option') {
                    let askButtonsObj = [];
                    step.options.forEach(function (option) {
                        askButtonsObj.push({title: option.label, payload: 'BUTTON_' + option.label});
                    });
                    let askButtons = generateButtons(askButtonsObj);
                    response = askTemplate(step.title, askButtons);
                    callSendAPI(sender_psid, response);
                }
                typingSendAPI(sender_psid, 'typing_off');
            });
            break;
        case 'wines':
            jsonData.text.forEach(function (step) {
                typingSendAPI(sender_psid, 'typing_on');
                if (step.response_type === 'text' && step.text) {
                    response = messageTemplate(step.text);
                    callSendAPI(sender_psid, response);
                } else if (step.response_type === 'option') {
                    let askButtonsObj = [];
                    step.options.forEach(function (option) {
                        askButtonsObj.push({title: option.label, payload: 'BUTTON_' + option.label});
                    });
                    let askButtons = generateButtons(askButtonsObj);
                    response = askTemplate(step.title, askButtons);
                    callSendAPI(sender_psid, response);
                }
                typingSendAPI(sender_psid, 'typing_off');
            });
            typingSendAPI(sender_psid, 'typing_on');
            setTimeout(() => {
                response = messageTemplate(jsonData.message);
                callSendAPI(sender_psid, response);
                winesList = jsonData.data;
                let wineButtonObj = [];
                wineButtonObj.push({
                    title: "Selected wines",
                    url: currentUrl + '/carouselView'
                });
                let wineButton = generateURLButtons(wineButtonObj);
                response = askTemplate('Discover', wineButton);
                callSendAPI(sender_psid, response);
                callNodeRed('API CALL SUCCESS', sender_psid, true);
                typingSendAPI(sender_psid, 'typing_off');
            }, 700);
            break;
        case 'dishes':
            typingSendAPI(sender_psid, 'typing_on');
            dishesList = jsonData.data;
            let dishButtonObj = [];
            dishButtonObj.push({
                title: "Dishes list",
                url: currentUrl + '/dishesView'
            });
            let dishButton = generateURLButtons(dishButtonObj);
            response = askTemplate(jsonData.text[0].text, dishButton);
            callSendAPI(sender_psid, response);
            typingSendAPI(sender_psid, 'typing_off');
            callNodeRed('API CALL SUCCESS', sender_psid, true);
            break;
        case 'pairing':
            jsonData.text.forEach(function (step) {
                typingSendAPI(sender_psid, 'typing_on');
                if (step.response_type === 'text' && step.text) {
                    response = messageTemplate(step.text);
                    callSendAPI(sender_psid, response);
                } else if (step.response_type === 'option') {
                    let askButtonsObj = [];
                    step.options.forEach(function (option) {
                        askButtonsObj.push({title: option.label, payload: 'BUTTON_' + option.label});
                    });
                    let askButtons = generateButtons(askButtonsObj);
                    response = askTemplate(step.title, askButtons);
                    callSendAPI(sender_psid, response);
                }
                typingSendAPI(sender_psid, 'typing_off');
            });
            typingSendAPI(sender_psid, 'typing_on');
            setTimeout(() => {
                response = messageTemplate(jsonData.message);
                callSendAPI(sender_psid, response);
                winesList = jsonData.data;
                let wineButtonObj = [];
                wineButtonObj.push({
                    title: "Selected wines",
                    url: currentUrl + '/carouselView'
                });
                let wineButton = generateURLButtons(wineButtonObj);
                response = askTemplate('Discover', wineButton);
                callSendAPI(sender_psid, response);
                callNodeRed('API CALL SUCCESS', sender_psid, true);
                typingSendAPI(sender_psid, 'typing_off');
            }, 700);
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

const generateURLButtons = (options) => {
    let buttons = [];
    options.forEach((option) => {
        let button = {
            "type": "web_url",
            "title": option.title,
            "url": option.url,
            "webview_height_ratio": "tall",
            "messenger_extensions": true
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

const callNodeRed = (value, sender_psid, silent) => {
    let currentPlace = config.get('facebook.widget_data.place_id');
    request({
        "uri": 'https://chatbot.wine-manager.com/watson/' + currentUser + '/' + currentPlace,
        "qs": {"value": value},
        "method": "GET"
    }, (err, res, body) => {
        if (!err) {
            let jsonResponse = JSON.parse(body);
            if (!silent) {
                sendMessage(sender_psid, jsonResponse);
            }
        } else {
            console.log("Error connecting to the Node-RED: " + err);
        }
    });
};

const getRandomId = (min, max) => {
    return Math.floor(Math.random() * (max - min)) + min;
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
        } else {
            console.error("Unable to send typing:" + err);
        }
    });
};