# Rise Together

A site for making Bangladeshi political posters. Sign in, choose a design, write the name and the other lines, then save or build the poster.

Live site: https://rise-together-ten.vercel.app

The API is https://rise-together-api.onrender.com

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

Copy `.env.example` to `.env.local` if you need a different API. `NEXT_PUBLIC_API_URL` is the API address. When it is empty, the page calls http://localhost:4000

## Pages

- `/` — make a poster, or open My posters. An admin also sees the Admin tab.
- `/login` — sign in with email or phone, and a password.
- `/register` — create an account.
- `/profile` — change the password.
