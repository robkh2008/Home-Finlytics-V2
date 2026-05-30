// ==================== data/defaultData.js ====================
// Default houses — empty by design. Users add their own houses via Settings.
// Houses are synced from the admin's account to all household members via Firebase.
// Each house now has linkedUsers (array of user IDs) instead of isAdminHouse.
const DEFAULT_HOUSES = [];

const DEFAULT_CATEGORIES = {
    expense: [{ name: 'Food', icon:"🍜", color: '#FF6B6B', subcategories: ['Dining Out', 'Snacks', 'Delivery & Takeout', 'Cafes & Coffee', 'Work Lunch', 'Fast Food'] },
        { name: 'Groceries', icon:"🛒", color: '#51CF66', subcategories: ['Vegetables', 'Fruits', 'Fish', 'Drinking Water', 'Meat', 'Dairy & Eggs', 'Grains', 'Snacks', 'Beverages', 'Pantry & Spices', 'Household'] },
        { name: 'House Rent', icon:"🏠", color: '#FF922B', subcategories: ['House Rent', 'Water Bill', 'Electric Bill', 'Motor Bill'] },
        { name: 'Transport', icon:"🚌", color: '#339AF0', subcategories: ['Fuel', 'Public Transport', 'Uber', 'Bike & Car Maintenance', 'Parking', 'Bike & Car Wash', 'Vehicle Insurance', 'Tolls', 'Flights'] },
        { name: 'Entertainment', icon:"🎮", color: '#F06595', subcategories: ['Movies', 'Games', 'Events', 'Subscriptions', 'Hobbies'] },
        { name: 'Utilities', icon:"💡", color: '#20C997', subcategories: ['Electricity', 'Water', 'Internet', 'Gas', 'Phone Bill', 'Trash/Garbage'] },
        { name: 'Shopping', icon:"🛍️", color: '#CC5DE8', subcategories: ['Clothing', 'Electronics', 'Home Appliances', 'Furniture & Decor', 'Kitchen Appliances', 'Gifts', 'Accessories'] },
        { name: 'Healthcare', icon:"🏥", color: '#FF8787', subcategories: ['Doctor', 'Medicine', 'Health Insurance', 'Gym', 'Dental', 'Vision'] },
        { name: 'Education', icon:"📚", color: '#748FFC', subcategories: ['Tuition', 'Books', 'Courses','Admission fees', 'Stationery'] },
        { name: 'Personal Care', icon:"💆", color: '#DA77F2', subcategories: ['Haircut', 'Cosmetics', 'Hair Care', 'Body Care', 'Skin Care', 'Spa'] },
        { name: 'Debt & Loans', icon:"💳", color: '#FF6D00', subcategories: ['Credit Card', 'EMI', 'Personal Loan', 'Home Loan', 'Car Loan', 'Business Loan'] },
        { name: 'Marup', icon:"💼", color: '#94D82D', subcategories: ['Rohen', 'Echan', 'Abe Phanek'] },
        { name: 'Landing', icon:"📤", color: '#FCC419', subcategories: ['Money Lent', 'Returned', 'Written Off'] },
        { name: 'Miscellaneous Expenses', icon:"📦", color: '#ADB5BD', subcategories: ['Other Expenses', 'Taxes', 'Home Transfer', 'Donations', 'Fines'] }],
    groceries: [
        { name: 'Groceries', icon:"🛒", color: '#51CF66', subcategories: ['Vegetables', 'Fruits', 'Fish', 'Drinking Water', 'Meat', 'Dairy & Eggs', 'Grains', 'Snacks', 'Beverages', 'Pantry & Spices', 'Household'] }
    ]
}
// Default payers — empty by design. Household members are added via Settings by any user.
// Payer names are linked to the logged-in user's household and synced via Firebase.
const DEFAULT_PAYERS = [];