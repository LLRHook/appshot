# Billington brand art

Unmodified copies of the real Billington marks, used as art layers in The Check sample campaign. They belong to Billington and are not general Appshot assets. Billington's repository was not changed.

| File | Source in `checksinmyhead` | Size | SHA-256 |
| --- | --- | --- | --- |
| `billy.png` | `mobile/assets/images/billy.png` | 1024 × 1536, ink inside 230,375–796,1161 | `e965d272969683240cf0c1b04e89c73a8923d380109b1312e2f452db225d60ae` |
| `billington-wordmark.png` | `mobile/assets/images/billington.png` | 1536 × 1024, ink inside 16,302–1480,647 | `dbf9aa3847b2f757cf0ee899f2e4bc336634aa48bbafd547f03d63d772bd8f50` |

Source commit for both files: `98471fbc7b4dc49da1cc33b666bdb8abecac9c64`. Paint them through an `ImageLayer` with `kind: 'art'`, cropping to the ink box. Use `sampling: 'pixelated'` when enlarging.
