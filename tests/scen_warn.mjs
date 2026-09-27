export default async ({ page, evalg, wait }) => {
  await page.addInitScript(() => {
    Error.stackTraceLimit = 60;
    const ow = console.warn;
    let n = 0;
    console.warn = (...a) => { if (String(a.join(' ')).includes('serialize') && n++ < 2) console.log('STACK', new Error().stack.split('\n').slice(10, 20).join(' | ')); ow(...a); };
  });
  await page.goto('' + (process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  await wait(9000);
};
