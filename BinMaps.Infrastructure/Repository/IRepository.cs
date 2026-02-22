using System.Linq.Expressions;
namespace BinMaps.Infrastructure.Repository;
public interface IRepository<TType, TId> where TType : class
{
    Task<TType?> GetByIdAsync(TId id);

    Task<TType?> FirstOrDefaultAsync(Expression<Func<TType, bool>> predicate);

    IQueryable<TType> GetAllAttached();

    Task<IEnumerable<TType>> GetAllAsync();

    Task AddAsync(TType item);

    Task AddRangeAsync(TType[] items);

    Task<bool> UpdateAsync(TType item);

    Task<bool> DeleteAsync(TType entity);
}