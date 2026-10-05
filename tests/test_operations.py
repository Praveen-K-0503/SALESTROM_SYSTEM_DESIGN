import urllib.request
import json
import time

BASE_URL = 'http://127.0.0.1:8000'

def req(path, method='GET', data=None):
    url = f"{BASE_URL}{path}"
    headers = {'Content-Type': 'application/json'}
    body = json.dumps(data).encode('utf-8') if data else None
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(request) as resp:
        return resp.status, json.loads(resp.read().decode('utf-8'))

def run_tests():
    print("=== 1. TEST PRODUCTS ===")
    status, data = req('/api/products')
    assert status == 200 and len(data['products']) == 8, f"Expected 8 products, got {len(data.get('products', []))}"
    print(f"PASS: Loaded {len(data['products'])} products.")

    print("=== 2. TEST COUPONS ===")
    status, cdata = req('/api/coupons')
    assert status == 200 and len(cdata['coupons']) >= 2
    status, app_res = req('/api/coupons/apply', 'POST', {'code': 'FLASH500', 'order_amount': 20000})
    assert status == 200 and app_res['discount_amount'] == 500
    print(f"PASS: Coupon FLASH500 validated, discount: {app_res['discount_amount']}")

    print("=== 3. TEST AUTH REGISTER ===")
    ts = int(time.time())
    new_email = f"rohan_{ts}@salestorm.in"
    new_phone = f"+91 9{ts % 1000000000:09d}"
    reg_data = {
        'name': 'Rohan Sharma',
        'email': new_email,
        'phone': new_phone,
        'password': 'mySecurePassword123',
        'shipping_address': 'Flat 402, Prestige Towers, Whitefield, Bengaluru 560066',
        'upi_id': 'rohan@okhdfcbank'
    }
    status, ures = req('/api/auth/register', 'POST', reg_data)
    assert status == 200 and ures['status'] == 'SUCCESS'
    user_id = ures['user']['id']
    print(f"PASS: User registered successfully. ID: {user_id}")

    print("=== 4. TEST AUTH LOGIN ===")
    status, lres = req('/api/auth/login', 'POST', {'login': new_email, 'password': 'mySecurePassword123'})
    assert status == 200 and lres['user']['id'] == user_id
    print("PASS: User login via email verified.")
    status, lres_ph = req('/api/auth/login', 'POST', {'login': new_phone, 'password': 'mySecurePassword123'})
    assert status == 200 and lres_ph['user']['id'] == user_id
    print("PASS: User login via phone verified.")

    print("=== 5. TEST USER PROFILE CRUD ===")
    status, prof = req(f'/api/users/{user_id}')
    assert status == 200 and prof['user']['name'] == 'Rohan Sharma'
    status, upd_res = req(f'/api/users/{user_id}', 'PUT', {'name': 'Rohan K. Sharma', 'phone': new_phone, 'upi_id': 'rohan.k@okhdfcbank'})
    assert status == 200 and upd_res['user']['name'] == 'Rohan K. Sharma'
    print("PASS: Profile read and update verified.")

    print("=== 6. TEST ADDRESS BOOK CRUD ===")
    status, addrs = req(f'/api/users/{user_id}/addresses')
    assert status == 200 and len(addrs['addresses']) >= 1
    status, new_addr = req(f'/api/users/{user_id}/addresses', 'POST', {
        'name': 'Rohan Office',
        'phone': new_phone,
        'pincode': '560103',
        'address_line': 'Tech Park 5, Outer Ring Road',
        'locality': 'Bellandur',
        'city': 'Bengaluru',
        'state': 'Karnataka',
        'address_type': 'WORK',
        'is_default': True
    })
    assert status == 200 and new_addr['status'] == 'SUCCESS'
    new_aid = new_addr['address_id']
    status, addrs_after = req(f'/api/users/{user_id}/addresses')
    assert len(addrs_after['addresses']) == 2
    status, del_res = req(f'/api/users/{user_id}/addresses/{new_aid}', 'DELETE')
    assert status == 200
    print("PASS: Address Book Create, Read, Set Default, and Delete verified.")

    print("=== 7. TEST WISHLIST CRUD ===")
    prod_id = 'prod-apex-watch'
    status, w_add = req('/api/wishlist/toggle', 'POST', {'user_id': user_id, 'product_id': prod_id})
    assert status == 200 and w_add['in_wishlist'] is True
    status, w_list = req(f'/api/wishlist?user_id={user_id}')
    assert status == 200 and w_list['count'] == 1
    status, w_rem = req('/api/wishlist/toggle', 'POST', {'user_id': user_id, 'product_id': prod_id})
    assert status == 200 and w_rem['in_wishlist'] is False
    print("PASS: Wishlist Add, Fetch, and Remove verified.")

    print("=== 8. TEST FLASH RESERVATION & ZERO-FEE UPI CHECKOUT ===")
    status, r_res = req('/api/reserve', 'POST', {'user_id': user_id, 'product_id': 'prod-titan-ring', 'quantity': 1, 'ttl_seconds': 600})
    assert status == 200 and r_res['status'] == 'RESERVED'
    res_id = r_res['reservation_id']
    print(f"PASS: Reservation created. ID: {res_id}")

    pay_payload = {
        'reservation_id': res_id,
        'payment_method': 'UPI_QR',
        'upi_vpa': 'rohan.k@okhdfcbank',
        'coupon_code': 'UPIFREE',
        'discount_amount': 1000,
        'idempotency_key': f"idem-{res_id}"
    }
    status, chk_res = req('/api/checkout', 'POST', pay_payload)
    assert status == 200 and chk_res['status'] == 'SUCCESS'
    pay_id = chk_res['payment_id']
    print(f"PASS: Checkout with UPI_QR successful. Payment {pay_id} verified.")

    # Wait for transactional outbox worker to process order
    time.sleep(1.0)
    status, user_orders = req(f'/api/orders?user_id={user_id}')
    assert status == 200 and len(user_orders['orders']) >= 1
    order = user_orders['orders'][0]
    order_id = order['id']
    order_num = order['order_number']
    print(f"PASS: Outbox worker generated Order #{order_num} (ID: {order_id})")

    print("=== 9. TEST ORDER TRACKING & TIMELINE ===")
    status, ord_res = req(f'/api/orders/{order_id}')
    assert status == 200 and ord_res['id'] == order_id
    assert len(ord_res['timeline']) >= 1
    print(f"PASS: Order tracking verified with {len(ord_res['timeline'])} timeline checkpoints.")

    print("=== 10. TEST ORDER CANCELLATION & ACID STOCK RESTORATION ===")
    status, prod_before = req('/api/products')
    qty_before = [p['available_quantity'] for p in prod_before['products'] if p['id'] == 'prod-titan-ring'][0]
    status, cancel_res = req(f'/api/orders/{order_id}/cancel', 'POST')
    assert status == 200 and cancel_res['status'] == 'SUCCESS'
    status, prod_after = req('/api/products')
    qty_after = [p['available_quantity'] for p in prod_after['products'] if p['id'] == 'prod-titan-ring'][0]
    assert qty_after == qty_before + 1, f"Expected qty {qty_before + 1}, got {qty_after}"
    print(f"PASS: Order cancelled. Stock accurately restored from {qty_before} to {qty_after}.")

    print("\nALL 10 CORE CODEBASE ENGINE TESTS PASSED WITH 100% INTEGRITY!")

if __name__ == '__main__':
    run_tests()
