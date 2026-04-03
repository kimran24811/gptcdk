--
-- PostgreSQL database dump
--

\restrict 3U2p4g6AhuTkXCOQviufa7yxkvZid9mU0V9vYNVDjraHqa2hXWOnV18uwRTyRVR

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.role AS ENUM (
    'admin',
    'customer'
);


ALTER TYPE public.role OWNER TO postgres;

--
-- Name: tx_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.tx_type AS ENUM (
    'credit',
    'debit'
);


ALTER TYPE public.tx_type OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: announcement_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.announcement_config (
    id integer NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    cta_text text DEFAULT ''::text NOT NULL,
    cta_url text DEFAULT ''::text NOT NULL,
    logo_data text,
    is_active integer DEFAULT 0 NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.announcement_config OWNER TO postgres;

--
-- Name: announcement_config_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.announcement_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.announcement_config_id_seq OWNER TO postgres;

--
-- Name: announcement_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.announcement_config_id_seq OWNED BY public.announcement_config.id;


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.api_keys (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    key_hash text NOT NULL,
    key_prefix text NOT NULL,
    active integer DEFAULT 1 NOT NULL,
    last_used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.api_keys OWNER TO postgres;

--
-- Name: api_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.api_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.api_keys_id_seq OWNER TO postgres;

--
-- Name: api_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.api_keys_id_seq OWNED BY public.api_keys.id;


--
-- Name: custom_products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.custom_products (
    id integer NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    price_cents integer NOT NULL,
    logo_data text,
    active integer DEFAULT 1 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.custom_products OWNER TO postgres;

--
-- Name: custom_products_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.custom_products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.custom_products_id_seq OWNER TO postgres;

--
-- Name: custom_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.custom_products_id_seq OWNED BY public.custom_products.id;


--
-- Name: custom_vouchers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.custom_vouchers (
    id integer NOT NULL,
    product_id integer NOT NULL,
    code text NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    sold_to integer,
    sold_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.custom_vouchers OWNER TO postgres;

--
-- Name: custom_vouchers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.custom_vouchers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.custom_vouchers_id_seq OWNER TO postgres;

--
-- Name: custom_vouchers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.custom_vouchers_id_seq OWNED BY public.custom_vouchers.id;


--
-- Name: deposit_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deposit_requests (
    id integer NOT NULL,
    user_id integer NOT NULL,
    amount_usdt text NOT NULL,
    amount_cents integer NOT NULL,
    network text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    tx_hash text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone NOT NULL
);


ALTER TABLE public.deposit_requests OWNER TO postgres;

--
-- Name: deposit_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.deposit_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.deposit_requests_id_seq OWNER TO postgres;

--
-- Name: deposit_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.deposit_requests_id_seq OWNED BY public.deposit_requests.id;


--
-- Name: inventory_keys; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_keys (
    id integer NOT NULL,
    plan text NOT NULL,
    key text NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    added_by integer NOT NULL,
    sold_to integer,
    sold_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone
);


ALTER TABLE public.inventory_keys OWNER TO postgres;

--
-- Name: inventory_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.inventory_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.inventory_keys_id_seq OWNER TO postgres;

--
-- Name: inventory_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.inventory_keys_id_seq OWNED BY public.inventory_keys.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    user_id integer NOT NULL,
    order_number text NOT NULL,
    product text NOT NULL,
    subscription text NOT NULL,
    quantity integer NOT NULL,
    amount_cents integer NOT NULL,
    keys text[] NOT NULL,
    status text DEFAULT 'delivered'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_id_seq OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


ALTER TABLE public.session OWNER TO postgres;

--
-- Name: transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transactions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    amount_cents integer NOT NULL,
    type public.tx_type NOT NULL,
    description text NOT NULL,
    created_by integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.transactions OWNER TO postgres;

--
-- Name: transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.transactions_id_seq OWNER TO postgres;

--
-- Name: transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.transactions_id_seq OWNED BY public.transactions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    name text NOT NULL,
    role public.role DEFAULT 'customer'::public.role NOT NULL,
    balance_cents integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: announcement_config id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_config ALTER COLUMN id SET DEFAULT nextval('public.announcement_config_id_seq'::regclass);


--
-- Name: api_keys id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_keys ALTER COLUMN id SET DEFAULT nextval('public.api_keys_id_seq'::regclass);


--
-- Name: custom_products id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_products ALTER COLUMN id SET DEFAULT nextval('public.custom_products_id_seq'::regclass);


--
-- Name: custom_vouchers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_vouchers ALTER COLUMN id SET DEFAULT nextval('public.custom_vouchers_id_seq'::regclass);


--
-- Name: deposit_requests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deposit_requests ALTER COLUMN id SET DEFAULT nextval('public.deposit_requests_id_seq'::regclass);


--
-- Name: inventory_keys id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_keys ALTER COLUMN id SET DEFAULT nextval('public.inventory_keys_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: transactions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions ALTER COLUMN id SET DEFAULT nextval('public.transactions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: announcement_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.announcement_config (id, title, body, cta_text, cta_url, logo_data, is_active, version, updated_at) FROM stdin;
\.


--
-- Data for Name: api_keys; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.api_keys (id, user_id, name, key_hash, key_prefix, active, last_used_at, created_at) FROM stdin;
1	1	My Test Key	aff3dc17644cfd0d2e5c6b3762ee94b804e23195f28d3c0fad30b6c3de8f8e4d	sk_live_68c24371	1	\N	2026-03-28 17:53:01.291999
\.


--
-- Data for Name: custom_products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.custom_products (id, name, description, price_cents, logo_data, active, created_at) FROM stdin;
\.


--
-- Data for Name: custom_vouchers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.custom_vouchers (id, product_id, code, status, sold_to, sold_at, created_at) FROM stdin;
\.


--
-- Data for Name: deposit_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.deposit_requests (id, user_id, amount_usdt, amount_cents, network, status, tx_hash, created_at, expires_at) FROM stdin;
1	1	10.0036	1000	trc20	expired	\N	2026-03-21 13:40:42.506747	2026-03-21 15:40:42.505
2	4	11.0011	1100	trc20	expired	\N	2026-03-21 15:18:38.482062	2026-03-22 15:18:38.48
3	4	11.0011	1100	bep20	expired	\N	2026-03-21 15:23:45.106762	2026-03-22 15:23:45.105
4	4	11.0014	1100	bep20	expired	\N	2026-03-21 15:35:13.454503	2026-03-22 15:35:13.452
5	4	10.9036	1090	bep20	expired	\N	2026-03-21 15:45:31.230003	2026-03-22 15:45:31.228
6	4	11.0095	1100	trc20	expired	\N	2026-03-21 15:47:17.945529	2026-03-22 15:47:17.944
7	4	10.9538	1095	trc20	expired	\N	2026-03-21 15:47:59.201873	2026-03-22 15:47:59.199
8	1	5.0072	500	trc20	expired	\N	2026-03-31 02:00:33.323597	2026-04-01 02:00:33.321
\.


--
-- Data for Name: inventory_keys; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.inventory_keys (id, plan, key, status, added_by, sold_to, sold_at, created_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (id, user_id, order_number, product, subscription, quantity, amount_cents, keys, status, created_at) FROM stdin;
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.session (sid, sess, expire) FROM stdin;
xvE4BeooOyX7DcwSpoyuOG7ms0vZzdku	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-04-23T19:42:59.872Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":1}	2026-04-23 19:43:00
Ycm27qXonp6oL9C6d9U692yNh2rbD_6j	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-04-27T17:52:35.263Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":1}	2026-04-27 17:53:02
2Jhdx_q23XT1afcy6xlLVQ0UpLu_XMWx	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-04-09T04:04:55.667Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":1}	2026-04-09 04:04:56
dCxVyMhWzXSdP5h7hOLPfkm53gW6gtH5	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-04-27T21:02:53.247Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":1}	2026-05-03 18:22:16
kuLRCDlKLbSqu_qS8m90NsQQ5rsTzqMf	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-04-09T00:59:37.775Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-04-09 01:00:04
ZdEzpr_XcGIe8psSR0EaBmQdX3DrODXz	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-04-09T01:07:40.306Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-04-09 01:07:42
hCgOMRG0JeuMrEoCjJzax_ICvgnBIfja	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-04-30T02:00:02.046Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":1}	2026-04-30 02:00:52
hd-Vp6PIpm-2qQWk_1wNGYyZI5g7JbTl	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-04-20T13:40:07.896Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":1}	2026-04-20 13:41:04
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.transactions (id, user_id, amount_cents, type, description, created_by, created_at) FROM stdin;
1	2	1000	credit	Test credit	1	2026-03-10 00:59:54.725778
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, password_hash, name, role, balance_cents, created_at) FROM stdin;
3	ali@gmail.com	$2b$10$LRI7M9tO3QMFXZ/YFrQFSuHVZek3QbuKDDg/aj2w6IBhkuQMFNYQ2	All	customer	0	2026-03-10 00:59:22.211125
2	testcustomer_1773104302393@test.com	$2b$10$tsZWwO7QSQVls4F2K03T6eEnsls0V/ZxKMoJGjSzLpL7.BhPYlMSK	Test Customer	customer	1000	2026-03-10 00:58:57.864835
1	admin@gptcdk.xyz	$2b$10$/A1kDQoVqaS1otll7e9GiujwUwQ/GIM9wiMJalObT3yzX6wOsEUJC	Admin Boss	admin	0	2026-03-10 00:53:02.101267
4	studenthub2032@gmail.com	$2b$10$CB4kAwGOlzoCgpsCinpAk.nRIvqoVJadpbTmcyXYq/AKA6o053fJm	Student Hub	customer	0	2026-03-21 15:18:21.775883
\.


--
-- Name: announcement_config_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.announcement_config_id_seq', 1, false);


--
-- Name: api_keys_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.api_keys_id_seq', 1, true);


--
-- Name: custom_products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.custom_products_id_seq', 1, false);


--
-- Name: custom_vouchers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.custom_vouchers_id_seq', 1, false);


--
-- Name: deposit_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.deposit_requests_id_seq', 8, true);


--
-- Name: inventory_keys_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.inventory_keys_id_seq', 1, false);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.orders_id_seq', 1, false);


--
-- Name: transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.transactions_id_seq', 1, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 4, true);


--
-- Name: announcement_config announcement_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_config
    ADD CONSTRAINT announcement_config_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: custom_products custom_products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_products
    ADD CONSTRAINT custom_products_pkey PRIMARY KEY (id);


--
-- Name: custom_vouchers custom_vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_vouchers
    ADD CONSTRAINT custom_vouchers_pkey PRIMARY KEY (id);


--
-- Name: deposit_requests deposit_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deposit_requests
    ADD CONSTRAINT deposit_requests_pkey PRIMARY KEY (id);


--
-- Name: inventory_keys inventory_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_keys
    ADD CONSTRAINT inventory_keys_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- Name: idx_inventory_keys_plan_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_inventory_keys_plan_status ON public.inventory_keys USING btree (plan, status);


--
-- Name: uniq_pending_deposit_amount; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uniq_pending_deposit_amount ON public.deposit_requests USING btree (network, amount_usdt) WHERE (status = 'pending'::text);


--
-- Name: api_keys api_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: custom_vouchers custom_vouchers_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_vouchers
    ADD CONSTRAINT custom_vouchers_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.custom_products(id);


--
-- Name: custom_vouchers custom_vouchers_sold_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_vouchers
    ADD CONSTRAINT custom_vouchers_sold_to_fkey FOREIGN KEY (sold_to) REFERENCES public.users(id);


--
-- Name: deposit_requests deposit_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deposit_requests
    ADD CONSTRAINT deposit_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: inventory_keys inventory_keys_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_keys
    ADD CONSTRAINT inventory_keys_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id);


--
-- Name: inventory_keys inventory_keys_sold_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_keys
    ADD CONSTRAINT inventory_keys_sold_to_fkey FOREIGN KEY (sold_to) REFERENCES public.users(id);


--
-- Name: orders orders_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: transactions transactions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 3U2p4g6AhuTkXCOQviufa7yxkvZid9mU0V9vYNVDjraHqa2hXWOnV18uwRTyRVR

