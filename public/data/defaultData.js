// ==================== data/defaultData.js ====================
// Default houses — empty by design. Users add their own houses via Settings.
// Houses are synced from the admin's account to all household members via Firebase.
// Each house now has linkedUsers (array of user IDs) instead of isAdminHouse.
const DEFAULT_HOUSES = [];

const DEFAULT_CATEGORIES = {
    expense: [{ name: 'Food', icon:"🍜", color: '#FF6B6B', subcategories: ['Dining Out', 'Snacks', 'Delivery & Takeout', 'Cafes & Coffee', 'Work Lunch', 'Fast Food', 'Bakery', 'Desserts', 'Ice Cream', 'Street Food', 'Tea & Chai', 'Juices & Smoothies'] },
        { name: 'Groceries', icon:"🛒", color: '#51CF66', subcategories: ['Vegetables', 'Fruits', 'Fish', 'Drinking Water', 'Meat', 'Dairy & Eggs', 'Grains', 'Snacks', 'Beverages', 'Pantry & Spices', 'Household', 'Frozen Foods', 'Canned Goods', 'Bread & Bakery', 'Cooking Oil', 'Organic'] },
        { name: 'House Rent', icon:"🏠", color: '#FF922B', subcategories: ['House Rent', 'Water Bill', 'Electric Bill', 'Motor Bill', 'Maintenance Fee', 'Property Tax', 'Security Deposit', 'Repairs'] },
        { name: 'Transport', icon:"🚌", color: '#339AF0', subcategories: ['Fuel', 'Public Transport', 'Uber', 'Bike & Car Maintenance', 'Parking', 'Bike & Car Wash', 'Vehicle Insurance', 'Tolls', 'Flights', 'Train', 'Taxi', 'Auto Rickshaw', 'Metro', 'Bus Pass', 'Roadside Assistance'] },
        { name: 'Entertainment', icon:"🎮", color: '#F06595', subcategories: ['Movies', 'Games', 'Events', 'Subscriptions', 'Hobbies', 'Concerts', 'Amusement Park', 'Zoo', 'Museum', 'Bowling', 'Karaoke', 'Streaming', 'Books & Comics', 'Board Games'] },
        { name: 'Utilities', icon:"💡", color: '#20C997', subcategories: ['Electricity', 'Water', 'Internet', 'Gas', 'Phone Bill', 'Trash/Garbage', 'Sewer', 'Home Security', 'Cable TV'] },
        { name: 'Shopping', icon:"🛍️", color: '#CC5DE8', subcategories: ['Clothing', 'Electronics', 'Home Appliances', 'Furniture & Decor', 'Kitchen Appliances', 'Gifts', 'Accessories', 'Footwear', 'Jewelry', 'Bags & Luggage', 'Cosmetics', 'Baby Products', 'Pet Supplies', 'Office Supplies'] },
        { name: 'Healthcare', icon:"🏥", color: '#FF8787', subcategories: ['Doctor', 'Medicine', 'Health Insurance', 'Gym', 'Dental', 'Vision', 'Vaccination', 'Blood Test', 'X-Ray & Scan', 'Surgery', 'Physiotherapy', 'Mental Health', 'Ayurveda', 'Homeopathy'] },
        { name: 'Education', icon:"📚", color: '#748FFC', subcategories: ['Tuition', 'Books', 'Courses','Admission fees', 'Stationery', 'Hostel Fees', 'Exam Fees', 'School Supplies', 'Online Course', 'Library Fees', 'Scholarship'] },
        { name: 'Personal Care', icon:"💆", color: '#DA77F2', subcategories: ['Haircut', 'Cosmetics', 'Hair Care', 'Body Care', 'Skin Care', 'Spa', 'Nail Care', 'Fragrance', 'Tattoo', 'Massage', 'Salon', 'Barber', 'Grooming'] },
        { name: 'Debt & Loans', icon:"💳", color: '#FF6D00', subcategories: ['Credit Card', 'EMI', 'Personal Loan', 'Home Loan', 'Car Loan', 'Business Loan', 'Education Loan', 'Loan Repayment', 'Interest', 'Late Fee'] },
        { name: 'Marup', icon:"💼", color: '#94D82D', subcategories: ['Rohen', 'Echan', 'Abe Phanek', 'Monthly Dues', 'Savings Pool', 'Emergency Fund'] },
        { name: 'Landing', icon:"📤", color: '#FCC419', subcategories: ['Money Lent', 'Returned', 'Written Off', 'Interest Earned', 'Loan Given', 'Loan Received'] },
        { name: 'Miscellaneous Expenses', icon:"📦", color: '#ADB5BD', subcategories: ['Other Expenses', 'Taxes', 'Home Transfer', 'Donations', 'Fines', 'Legal Fees', 'Bank Charges', 'ATM Fees', 'Membership Fees', 'Courier', 'Printing'] },
        { name: 'Electronics & Accessories', icon:"🔌", color: '#E17055', subcategories: ['Mobile Phone', 'Laptop', 'Tablet', 'Headphones', 'Smartwatch', 'Charger & Cable', 'Power Bank', 'Keyboard & Mouse', 'Monitor', 'Printer', 'Router', 'Webcam', 'Speaker', 'USB Drive', 'Hard Drive', 'Phone Case', 'Screen Guard', 'VR Headset', 'Gaming Console', 'Camera', 'Tripod', 'Smart Home', 'Fitness Tracker'] }],
    groceries: [
        { name: 'Groceries', icon:"🛒", color: '#51CF66', subcategories: ['Vegetables', 'Fruits', 'Fish', 'Drinking Water', 'Meat', 'Dairy & Eggs', 'Grains', 'Snacks', 'Beverages', 'Pantry & Spices', 'Household', 'Frozen Foods', 'Canned Goods', 'Bread & Bakery', 'Cooking Oil', 'Organic'] }
    ]
}
// Default payers — empty by design. Household members are added via Settings by any user.
// Payer names are linked to the logged-in user's household and synced via Firebase.
const DEFAULT_PAYERS = [];