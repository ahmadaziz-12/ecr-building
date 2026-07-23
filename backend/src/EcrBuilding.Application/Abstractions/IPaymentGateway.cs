namespace EcrBuilding.Application.Abstractions;

public record PaymentChargeResult(bool Success, string ReferenceNumber, string? FailureReason);

// Happy-path-only abstraction — a real gateway (Mada/STC Pay/Apple Pay) can implement this later
// without touching Order/OrderPayment shapes.
public interface IPaymentGateway
{
    Task<PaymentChargeResult> ChargeAsync(string method, decimal amount, CancellationToken cancellationToken = default);
}
