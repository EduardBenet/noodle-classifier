module.exports = async function (context, req) {
    const data = require('../data/noodles.json');
    context.res = {
        headers: { "Content-Type": "application/json" },
        body: data
    };
};