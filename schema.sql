create extension if not exists "uuid-ossp";

-- TAVOLI
create table if not exists tables (
  id uuid primary key default uuid_generate_v4(),
  numero integer not null unique,
  qr_token text not null unique,
  created_at timestamp default now()
);

-- ORDINI
create table if not exists orders (
  id uuid primary key default uuid_generate_v4(),
  table_id uuid references tables(id) on delete cascade,
  status text default 'pending',
  totale numeric(10,2) not null,
  stripe_session_id text,
  created_at timestamp default now()
);

-- ORDER ITEMS
create table if not exists order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references orders(id) on delete cascade,
  nome text not null,
  prezzo numeric(10,2) not null,
  quantita integer not null,
  created_at timestamp default now()
);
