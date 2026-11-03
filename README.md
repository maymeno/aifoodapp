# 🍱 Food Snap

เว็บแอปบันทึกแคลอรี่จากรูปอาหาร ถ่ายรูป → AI บอกชื่อเมนูและแคลอรี่ → บันทึก และดูยอดรวมของแต่ละวัน

- HTML + CSS + JavaScript ล้วน ไม่ต้อง build
- เก็บข้อมูลใน `localStorage` ของเบราว์เซอร์
- วิเคราะห์รูปผ่าน API แบบ OpenAI-compatible (ค่าเริ่มต้น: [KKU IntelSphere](https://gen.ai.kku.ac.th) โมเดล `claude-sonnet-5.5`)

## วิธีใช้

1. เปิดแอปผ่าน web server เช่น

   ```bash
   npx http-server -p 5500 -c-1 .
   ```

   แล้วเข้า http://localhost:5500 (หรือ deploy ขึ้น GitHub Pages)
2. กด ⚙️ ใส่ API Key จากหน้า Get started ของ gen.ai.kku.ac.th
3. ถ่ายรูปอาหาร หรือเลือกรูปจากคลัง

## หมายเหตุ

API Key ถูกเก็บไว้ในเบราว์เซอร์ของผู้ใช้แต่ละคนเท่านั้น ไม่ได้อยู่ในโค้ด แอปเรียก API โดยตรงจากเบราว์เซอร์ จึงเหมาะกับการใช้งานส่วนตัว
