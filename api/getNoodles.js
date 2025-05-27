module.exports = async function (context, req) {
    context.res = {
        status: 200,
        body: [{ id: "test-1", name: "Shin Ramyun" }]
    };
};