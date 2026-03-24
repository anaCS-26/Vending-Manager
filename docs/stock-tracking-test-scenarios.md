# Stock Tracking Test Scenarios

This checklist validates the `warehouse -> driver -> machine -> return` flow after the returned-items upgrade.

## Scenario 1: Normal Dispatch + Refill + Return

1. Create a dispatch with one item quantity `20`.
2. Refill machine with `refilled=12`, `returned=2`.
3. Close route with end return `6`.
4. Expected:
- `12 + 2 + 6 = 20` (dispatch fully reconciled).
- Machine stock estimate updates by `+12 -2` for that item (bounded by capacity).
- Return verification includes one `RETURNED` record with quantity `2`.

## Scenario 2: Route Over-Consumption Block

1. Create dispatch with one item quantity `10`.
2. Submit refill payload with `refilled=8`, `returned=3`.
3. Expected:
- Request fails because attempted consumption `11` exceeds remaining `10`.
- No refill log written.
- No machine stock update written.

## Scenario 3: End Return Upper-Bound Block

1. Create dispatch with quantity `15`.
2. Log refill `refilled=9`, `returned=2`.
3. Attempt route close with end return `5`.
4. Expected:
- Request fails because max returnable is `15 - (9+2) = 4`.
- Dispatch remains open.

## Scenario 4: Closed Dispatch Write Block

1. Close a dispatch.
2. Attempt another refill on same dispatch.
3. Expected:
- Request fails with closed-dispatch error.

## Scenario 5: Cross-Dispatch Item Tampering Block

1. Have dispatch `A` and dispatch `B`.
2. Attempt to close dispatch `A` using `dispatchItemId` from dispatch `B`.
3. Expected:
- Request fails with ownership error.
- No warehouse stock mutation.

## Scenario 6: Offline Queue Backward Compatibility

1. In browser storage, add old payload shape using `expired` field.
2. Restore connectivity and auto-sync.
3. Expected:
- Sync succeeds by mapping `expired -> returned`.
- No runtime crash.

## Scenario 7: Warehouse Race Safety

1. Trigger two concurrent dispatches trying to consume near-identical warehouse stock.
2. Expected:
- At least one dispatch fails when stock no longer meets `quantity_on_hand >= requested`.
- Warehouse stock never goes below zero from race condition.

## Scenario 8: Route History Variance Accuracy

1. Run a route where item totals are:
- Given `30`
- Refilled `20`
- Route Returned `4`
- End Returned `6`
2. Expected:
- Variance displays as `0` in history filters and cards.

