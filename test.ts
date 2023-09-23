import { performance } from "perf_hooks";
import supertest from "supertest";
import { buildApp } from "./app";

const app = supertest(buildApp());

async function basicLatencyTest() {
    await app.post("/reset").expect(204);
    const start = performance.now();
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    console.log(`Latency: ${performance.now() - start} ms`);
}

async function basicParallelTest() {
    await app.post("/reset").send({ "account": "test" }).expect(204);
    const start = performance.now();
    await Promise.all([
        app.post("/charge").send({ "account": "test", "charges": 15 }).expect(200),
        app.post("/charge").send({ "account": "test", "charges": 15 }).expect(200),
        app.post("/charge").send({ "account": "test", "charges": 15 }).expect(200)
    ]);
    await app.post("/charge").send({ "account": "test", "charges": 15 }).expect(res => {
        if (res.body.remainingBalance !== 40) {
            throw new Error(`Error: Expected balance: 40. Actual Balance: ${res.body.remainingBalance}`);
        }
    });
    console.log(`Latency: ${performance.now() - start} ms`);
}

async function basicNoBalanceTest() {
    await app.post("/reset").send({ "account": "test" }).expect(204);
    const responses = await Promise.all([
        app.post("/charge").send({ "account": "test", "charges": 100 }).expect(200),
        app.post("/charge").send({ "account": "test", "charges": 15 }).expect(200)
    ]);
    const authorized = responses.some(res => !res.body.isAuthorized);
    if (!authorized) {
        throw new Error(`Error: No responses were unauthorized even when balance was negative`);
    }
}

async function runTests() {
    await basicLatencyTest();
    await basicParallelTest();
    await basicNoBalanceTest();
}

runTests().catch(console.error);
