const { JSDOM } = require("jsdom");
const html = `<links><link>http://www.11st.co.kr/products/9132507261/share</link></links>`;
const dom = new JSDOM(html);
console.log(dom.window.document.querySelector('links').innerHTML);
