// In-memory push subscription store (prototype only)
// In production, subscriptions would be stored in the database

type PushSubscriptionData = {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
};

declare const globalThis: {
    pushSubscriptions: Map<string, PushSubscriptionData>;
} & typeof global;

export const pushSubscriptions: Map<string, PushSubscriptionData> =
    globalThis.pushSubscriptions ?? new Map();

if (process.env.NODE_ENV !== "production") {
    globalThis.pushSubscriptions = pushSubscriptions;
}
