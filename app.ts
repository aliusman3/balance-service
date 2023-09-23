import express from "express";
import { WatchError, createClient } from "redis";
import { json } from "body-parser";

const DEFAULT_BALANCE = 100;

interface ChargeResult {
    isAuthorized: boolean;
    remainingBalance: number;
    charges: number;
}

async function connect(): Promise<ReturnType<typeof createClient>> {
    const url = `redis://${process.env.REDIS_HOST ?? "localhost"}:${process.env.REDIS_PORT ?? "6379"}`;
    console.log(`Using redis URL ${url}`);
    const client = createClient({ url });
    await client.connect();
    return client;
}

async function reset(account: string): Promise<void> {
    const client = await connect();
    try {
        await client.set(`${account}/balance`, DEFAULT_BALANCE);
    } finally {
        await client.disconnect();
    }
}

async function charge(account: string, charges: number): Promise<ChargeResult> {
    const client = await connect();
    let res;
    try {
        const key = `${account}/balance`;
        await client.watch(key);
        const balance = parseInt((await client.get(key)) ?? "");
        if (balance >= charges) {
            const multi = await client.multi();
            multi.decrBy(key, charges).get(key);
            const response = await multi.exec();
            const remainingBalance = parseInt(response[1] as string ?? "");
            res = { isAuthorized: true, remainingBalance, charges };
        } else {
            res = { isAuthorized: false, remainingBalance: balance, charges: 0 };
        }
    } catch (e) {
        if (e instanceof WatchError) {
            await new Promise(resolve => setTimeout(resolve, 10));
            res = await charge(account, charges);
        } else {
            throw e;
        }
    } finally {
        await client.disconnect();
        return res as ChargeResult;
    }
}

export function buildApp(): express.Application {
    const app = express();
    app.use(json());
    app.post("/reset", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            await reset(account);
            console.log(`Successfully reset account ${account}`);
            res.sendStatus(204);
        } catch (e) {
            console.error("Error while resetting account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    app.post("/charge", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            const result = await charge(account, req.body.charges ?? 10);
            console.log(`Successfully charged account ${account}`);
            res.status(200).json(result);
        } catch (e) {
            console.error("Error while charging account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    return app;
}
