
const branch = require('branchio-sdk');
const client = branch({
  appId: '979136149870105469',
  key: 'key_live_ah5BOxATOvC3lRiZ7Y988omkCAjZq67x',
  secret: 'secret_live_6PJiKglMsZkz3ZHcKAabJlnAKM5Ekd0Z'
});

(async () => {
  const { url } = await client.link({
    alias: '',
    stage: 'new patient invite',
    channel: 'mobile',
    feature: 'patients',
    data: {
      'doctorId': 'MaJmcbQhTjSympGSJOpwVHZO1jf2',
    }
  });
  console.log(url);
})();
