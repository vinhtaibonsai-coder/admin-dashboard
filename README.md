# Admin Dashboard - Order Management System

Giao diện Admin Dashboard hiển thị và quản lý đơn hàng kết nối Supabase Auth & Supabase Database (PostgreSQL).

## 🚀 Hướng dẫn Deploy Vercel

1. **Push lên GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for Admin Dashboard"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Deploy Vercel**:
   - Truy cập [Vercel Dashboard](https://vercel.com/new).
   - Chọn kho chứa GitHub vừa push.
   - Nhấn **Deploy** (Vercel sẽ tự động nhận diện file `index.html` làm trang chủ).

## 🛠 Cấu trúc thư mục
- `index.html`: Giao diện Dashboard + Login màn hình Auth + Card View Mobile & Table View Desktop.
- `supabase-config.js`: File chứa URL & Anon Key dự án Supabase.
