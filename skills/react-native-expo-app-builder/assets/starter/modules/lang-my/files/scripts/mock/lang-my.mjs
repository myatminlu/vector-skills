/** Adds a Burmese item, to check the tall-script line height on real content. */
export const order = 20;

export function register(app) {
  app.items.push({ id: 'my', title: 'မြန်မာစာ', summary: 'စာကြောင်းအမြင့်ကို စစ်ဖို့ နမူနာ။', body: 'မြန်မာစာလုံးတွေရဲ့ အပေါ်က သင်္ကေတတွေ ပြတ်မသွားဖို့ စာကြောင်းအမြင့်ကို ဖောင့်ရဲ့ line box အတိုင်း ထားရပါတယ်။ ဒီစာမျက်နှာက အဲဒါကို စစ်ဖို့ပါ။' });
}
