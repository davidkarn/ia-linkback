# web

React front end for the citations API.

```sh
# in ../ : start the API (port 3000)
source ./db_env.sh && npm start

# here
npm install
npm run dev          # http://localhost:5173
```

The dev server proxies `/api/*` to the API (`/api/books` -> `http://localhost:3000/books`).
Set `API_URL` to point it elsewhere.
