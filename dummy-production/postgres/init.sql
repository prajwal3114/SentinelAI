CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    customer_id VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO orders (customer_id, amount, status) VALUES
('cust_101', 99.99, 'completed'),
('cust_102', 149.50, 'processing'),
('cust_103', 29.99, 'completed')
ON CONFLICT DO NOTHING;
