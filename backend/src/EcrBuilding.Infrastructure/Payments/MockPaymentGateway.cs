using System.Security.Cryptography;
using EcrBuilding.Application.Abstractions;

namespace EcrBuilding.Infrastructure.Payments;

// Always succeeds — happy-flow only, per product decision. Cash never needs a "gateway" reference
// but gets one anyway for a consistent OrderPayment shape.
public class MockPaymentGateway : IPaymentGateway
{
    public Task<PaymentChargeResult> ChargeAsync(string method, decimal amount, CancellationToken cancellationToken = default)
    {
        var reference = $"{method.ToUpperInvariant()}-{Convert.ToHexString(RandomNumberGenerator.GetBytes(6))}";
        return Task.FromResult(new PaymentChargeResult(true, reference, null));
    }
}
