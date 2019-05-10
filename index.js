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
    port = 1337,
    FACEBOOK_URI = config.get('facebook.page.uri');

let currentUrl;
let otherActive;
let inquiryActive;
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '../www')));

app.listen(port, (err, req, res) => {
    if (err) return console.log(`Something bad has happen : ${err}`);
    console.log(`Server listening at port ${port}`);
    // let ngrok = require('ngrok');
    // ngrok.connect(port, (err, url) => {
    //     console.log(`Server publicly acessible at ${url}`);
    // });
});

app.get('/', (req, res) => {
    res.send('Hello World!');
    console.log('Main page');
});

app.get('/about', function (request, response) {
    response.send('About Us');
});

app.get('*', (req, res) => {
    console.log(req.path);
    let regExp = /(\w*)\.(\w*)/g;
    let requestExt = regExp.exec(req.path);
    if (requestExt) {
        console.log(requestExt);
        if (requestExt[2] === 'png' || requestExt[2] === 'jpg') {
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
            currentUrl = req.protocol + '://' + req.get('host');
            console.log(`URL: ${currentUrl}`);
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
    if(inquiryActive) {
        response = messageTemplate('Thanks for your inquiry, one of our MG Experts will get in touch with you during working hours. Have a great day!');
        callSendAPI(sender_psid, response);
        inquiryActive = false;
        return;
    }
    if(otherActive) {
        response = messageTemplate('Thanks for your request, one of our MG Experts will get in touch with you during working hours. Have a great day!');
        callSendAPI(sender_psid, response);
        otherActive = false;
        return;
    }
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
    // console.log(payload);
    let model;
    let result = /(\w+)(quote)/gi.exec(payload);
    let otherResult = /(\w+)_(other)/gi.exec(payload);
    let manualResult = /(\w+)_(manual)/gi.exec(payload);
    let discoverResult = /(\w+)_(DISCOVERMODEL)/gi.exec(payload);
    let detailResult = /(\w+)_(DETAIL)_(\w+)/gi.exec(payload);
    let timer;
    let countryWithCities;
    let manual;
    let discover;
    let detail;
    let modelDetail;
    if (result) {
        payload = result[2];
        model = result[1];
    }
    if (otherResult) {
        payload = otherResult[2];
        countryWithCities = otherResult[1];
    }
    if (manualResult) {
        payload = manualResult[2];
        manual = manualResult[1];
    }
    if (discoverResult) {
        payload = discoverResult[2];
        discover = discoverResult[1];
    }
    if (detailResult) {
        payload = detailResult[2];
        modelDetail = detailResult[1];
        detail = detailResult[3];
    }
    let name = 'User';
    const config = require('config');
    console.log(`Payload: ${payload} | Country: ${countryWithCities}`);
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
            let langResponse = fileTemplate(currentUrl + '/img/after.png');
            console.log(currentUrl + '/img/after.png');
            callSendAPI(sender_psid, langResponse);
            setTimeout(() => {
                let buttons = generateButtons([{
                    title: 'Discover MG',
                    payload: 'DISCOVER'
                }, {title: 'After sales', payload: 'AFTER_SALES'}]);
                response = askTemplate('Great, now what would you like to talk about today?', buttons);
                callSendAPI(sender_psid, response);
            }, 3000);
            break;
        case 'DISCOVER':
            let discoverMessage = messageTemplate("All new MG cars come with 6 years or 200,000 km warranty (whichever comes first) T&C's apply. Which one best reflects your personality");
            callSendAPI(sender_psid, discoverMessage);
            let models = config.get('facebook.data.models');
            let modelSlides = [];
            models.forEach((model) => {
                let buttonsObjects = [];
                buttonsObjects.push({
                    "title": 'Discover the ' + model.title,
                    "payload": model.title + '_DISCOVERMODEL'
                });
                let modelButtons = generateButtons(buttonsObjects);
                let modelSlide = generateSlide({
                    "title": model.title,
                    "subtitle": model.subtitle,
                    "img": currentUrl + '/img/' + model.title + '.png'
                }, modelButtons);
                modelSlides.push(modelSlide);
            });
            response = generatedSliderTemplate(modelSlides);
            callSendAPI(sender_psid, response);
            break;
        case 'DISCOVEROTHER':
            let otherButtons = generateURLButtons([{"title": 'MG Website', "url": 'https://www.mgmotor.me/'}]);
            response = askTemplate('Please let me know what else I can help you with?', otherButtons);
            callSendAPI(sender_psid, response);
            otherActive = true;
            break;
        case 'DISCOVERMODEL':
            let modelsWithDetails = config.get('facebook.data.models');
            let detailsSlides = [];
            let currentModel = modelsWithDetails.find((model) => {
                if (model.title === discover) return model;
            });
            currentModel.details.forEach((detail) => {
                let detailButton = generateButtons([{
                    "title": "Discover",
                    "payload": currentModel.title + '_DETAIL_' + detail.title
                }]);
                let detailSlide = generateSlide({
                    "title": detail.title,
                    "img": currentUrl + '/img/' + currentModel.title + '/' + detail.image1 + '.png'
                }, detailButton);
                detailsSlides.push(detailSlide);
            });
            response = generatedSliderTemplate(detailsSlides);
            callSendAPI(sender_psid, response);
            break;
        case 'DETAIL':
            console.log(`Model: ${modelDetail} | Detail: ${detail}`);
            let modelsForDetails = config.get('facebook.data.models');
            let currentDetailModel = modelsForDetails.find((model) => {
                if (model.title === modelDetail) return model;
            });
            let currentDetail = currentDetailModel.details.find((detailBase) => {
                if (detailBase.title === detail) return detailBase;
            });
            response = messageTemplate(currentDetail.title);
            callSendAPI(sender_psid, response);
            let detailResponse = fileTemplate(currentUrl + '/img/' + currentDetailModel.title + '/' + currentDetail.image2 + '.png');
            callSendAPI(sender_psid, detailResponse);
            setTimeout(()=>{
                let afterObj = [];
                currentDetailModel.buttons.forEach((button)=>{
                    afterObj.push(button);
                });
                afterObj.push({
                    'title': 'Showroom locations',
                    'payload': 'SHOWROOM_LOCATION'
                });
                afterObj.push({'title': 'Other', 'payload': 'DISCOVEROTHER'});
                let afterSlides = [];
                let learnMore = generateURLButtons([{"title": "Learn More", "url": currentDetail.learn}]);
                let learnMoreSlide = generateSlide({"title": "Learn More"}, learnMore);
                afterSlides.push(learnMoreSlide);
                afterObj.forEach((button)=>{
                    let buttonNew = generateButtons([button]);
                    let afterSlide = generateSlide({"title": button.title}, buttonNew);
                    afterSlides.push(afterSlide);
                });
                let brochureButton = generateURLButtons([{"title": "Brochure", "url": currentDetailModel.brochure}]);
                let brochureSlide = generateSlide({"title": "Brochure"}, brochureButton);
                afterSlides.push(brochureSlide);
                let afterResponse = generatedSliderTemplate(afterSlides);
                callSendAPI(sender_psid, afterResponse);
            }, 4000);
            break;
        case 'QUOTE':
            response = messageTemplate('Nice choice the ' + model);
            callSendAPI(sender_psid, response);
            let imageSrc = currentUrl + '/img/' + model + '.png';
            console.log(`Image URL: ${imageSrc}`);
            let second_response = fileTemplate(imageSrc);
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
                    let countrySlide = generateSlide({"title": country.title, "img": imageSrc}, citiesButtons);
                    countrySlides.push(countrySlide);
                });
                let fourth_response = generatedSliderTemplate(countrySlides);
                callSendAPI(sender_psid, fourth_response);
            }, 4000);
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
        case 'AFTER_SALES':
            let salesButtons = generateButtons([{
                'title': 'Service Centers',
                payload: 'SERVICE_CENTERS'
            }, {'title': 'Inquiry', payload: 'INQUIRY'}, {'title': 'Warranty', payload: 'WARRANTY'}]);
            response = askTemplate('MG is a globally recognized brand and is also one of the pioneers of the automotive industry. We have accomplished this, only by keeping owners of MG cars happy. What can I do for you today?', salesButtons);
            callSendAPI(sender_psid, response);
            break;
        case 'SERVICE_CENTERS':
            let serviceCountries = config.get('facebook.data.countries');
            let serviceCountrySlides = [];
            let serviceAskResponse = messageTemplate('Which service center is the most convenient for you?');
            callSendAPI(sender_psid, serviceAskResponse);
            serviceCountries.forEach((country) => {
                let citiesObjects = [];
                if (country.cities.length <= 3) {
                    country.cities.forEach((city) => {
                        citiesObjects.push({"title": city.title, "payload": city.title + '_SERVICE'});
                    });
                } else if (country.cities.length > 3) {
                    for (let i = 0; i < 2; i++) {
                        citiesObjects.push({
                            "title": country.cities[i].title,
                            "payload": country.cities[i].title + '_SERVICE'
                        });
                    }
                    citiesObjects.push({"title": "Other", "payload": country.title + '_other'});
                }
                let citiesButtons = generateButtons(citiesObjects);
                let countrySlide = generateSlide({"title": country.title}, citiesButtons);
                serviceCountrySlides.push(countrySlide);
            });
            let serviceResponse = generatedSliderTemplate(serviceCountrySlides);
            callSendAPI(sender_psid, serviceResponse);
            break;
        case 'MANUALS':
            response = messageTemplate('Which model do you have?');
            callSendAPI(sender_psid, response);
            let manualModels = config.get('facebook.data.models');
            let manualModelSlides = [];
            manualModels.forEach((model) => {
                let buttonsObjects = [{'title': model.title, 'payload': model.title + '_MANUAL'}];
                let modelButtons = generateButtons(buttonsObjects);
                let modelSlide = generateSlide({
                    "title": model.title,
                    "subtitle": model.subtitle,
                    "img": currentUrl + '/img/' + model.title + '.png'
                }, modelButtons);
                manualModelSlides.push(modelSlide);
            });
            let models_response = generatedSliderTemplate(manualModelSlides);
            callSendAPI(sender_psid, models_response);
            break;
        case 'WARRANTY':
            let warrantyUrl = 'https://www.mgmotor.me/ownership/mg-care/';
            let warrantyButton = generateURLButtons([{"title": 'Learn More', "url": warrantyUrl}]);
            let warrantySlide = generateSlide({"title": 'MG Care', "subtitle": "Learn more about our extended MG Care package"}, warrantyButton);
            response = generatedSliderTemplate([warrantySlide]);
            callSendAPI(sender_psid, response);
            setTimeout(()=>{
                let otherButtons = generateURLButtons([{"title": 'MG Website', "url": 'https://www.mgmotor.me/'}]);
                let otherResponse = askTemplate('Please let me know what else I can help you with?', otherButtons);
                otherActive = true;
                callSendAPI(sender_psid, otherResponse);
            },2500);
            break;
        case 'INQUIRY':
            response = messageTemplate('Please let me know what your inquiry is about?');
            callSendAPI(sender_psid, response);
            inquiryActive = true;
            break;
        case 'other':
            console.log(`Other cities of ${countryWithCities}`);
            let countriesOther = config.get('facebook.data.countries');
            let citiesSlide = [];
            let newCountry = countriesOther.find((country) => {
                if (country.title === countryWithCities) {
                    return country;
                }
            });
            console.log(newCountry.cities);
            newCountry.cities.forEach((city) => {
                let button = generateButtons([{"title": city.title, "payload": city.title}]);
                let citySlide = generateSlide({"title": city.title}, button);
                citiesSlide.push(citySlide);
            });
            response = generatedSliderTemplate(citiesSlide);
            callSendAPI(sender_psid, response);
            break;
        case 'MANUAL':
            console.log(`Manual for ${manual}`);
            let manuals = config.get('facebook.data.models');
            let manualCar = manuals.find((model) => {
                if (model.title === manual) return model;
            });
            let modelSrc = currentUrl + '/img/' + manualCar.title + '.png';
            let modelButton = generateButtons([{"title": 'Manual', "payload": manualCar.title + '_manualButton'}]);
            let modelSlide = generateSlide({
                "title": manualCar.title,
                "subtitle": manualCar.subtitle,
                "img": modelSrc
            }, modelButton);
            response = generatedSliderTemplate([modelSlide]);
            callSendAPI(sender_psid, response);
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

const generateURLButtons = (options) => {
    let buttons = [];
    options.forEach((option) => {
        let button = {
            "type": "web_url",
            "title": option.title,
            "url": option.url
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