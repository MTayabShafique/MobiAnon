import React from "react";

const Guide = () => {
  return (
    <div className="p-6 max-w-4xl mx-auto bg-white shadow-lg rounded-lg border border-gray-200">
      <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">User Guide</h1>
      
      <div className="space-y-6">
        {/* Grid Size Section */}
        <div className="p-4 bg-blue-50 rounded-lg">
          <h2 className="text-xl font-semibold text-blue-800">Grid Size Input</h2>
          <p className="text-gray-700 mt-2">The grid size determines the level of detail and anonymity in data visualization.</p>
          <ul className="list-disc pl-6 mt-2 text-gray-600">
            <li>Smaller grid sizes (e.g., <code className="bg-gray-100 px-1 rounded">0.01</code>) give detailed but less anonymous data.</li>
            <li>Larger grid sizes (e.g., <code className="bg-gray-100 px-1 rounded">0.04</code>) provide more privacy but lower detail.</li>
            <li>Choose an appropriate grid size based on your preference for privacy and data granularity.</li>
          </ul>
        </div>
        
        {/* Filtering Options */}
        <div className="p-4 bg-green-50 rounded-lg">
          <h2 className="text-xl font-semibold text-green-800">Date and Member Type Filters</h2>
          <p className="text-gray-700 mt-2">These filters help refine your dataset for better insights.</p>
          <ul className="list-disc pl-6 mt-2 text-gray-600">
            <li><strong>Select Date:</strong> Pick a day to analyze specific trips.</li>
            <li><strong>Member Type:</strong> Choose between "Member" or "Casual" users.</li>
            <li>Use filters to focus on a targeted subset of trips.</li>
          </ul>
        </div>
        
        {/* Filtering Buttons */}
        <div className="p-4 bg-yellow-50 rounded-lg">
          <h2 className="text-xl font-semibold text-yellow-800">Applying Filters</h2>
          <p className="text-gray-700 mt-2">Use the following options to visualize your data:</p>
          <ul className="list-disc pl-6 mt-2 text-gray-600">
            <li>
              <strong>Apply Original Data Filter:</strong>
              <ul className="list-disc pl-6">
                <li>Displays unprocessed trip data.</li>
                <li>Red markers represent station locations.</li>
                <li>Blue lines show trip paths.</li>
                <li>Hover over a point for trip details.</li>
              </ul>
            </li>
            <li><strong>Apply Raw Data Filter:</strong> Displays unprocessed raw trip data.</li>
            <li><strong>Apply Anonymized Data Filter:</strong> Groups trips into clusters and generates heatmaps.</li>
          </ul>
        </div>
      </div>
      
      {/* Backend Logic Section */}
      <div className="mt-5 p-4 bg-gray-100 rounded-lg">
        <h2 className="text-lg font-semibold text-gray-800">How the Backend Works</h2>
        <p className="text-gray-600 mt-2">
          Our system uses <strong>k-anonymity</strong> to ensure privacy. Data is grouped into clusters, reducing the risk of identifying individuals. The visualization helps users balance between detail and privacy.
        </p>
        <h3 className="text-base font-semibold text-gray-800 mt-3">Process Overview:</h3>
        <ul className="text-gray-600 pl-5 mt-2 list-disc">
          <li><strong>1. Validate Data:</strong> Ensure trips contain valid latitude and longitude values.</li>
          <li><strong>2. Grid Mapping:</strong> Divide the map into cells (~1.1 km per cell).</li>
          <li><strong>3. Grouping:</strong> Cluster trips within each grid cell.</li>
          <li><strong>4. Merge Small Groups:</strong> If a group has fewer than k trips, merge it with the nearest neighbor.</li>
          <li><strong>5. Compute Centroids:</strong> Calculate average locations for anonymized trip clusters.</li>
          <li><strong>6. Visualize:</strong> Display anonymized data using heatmaps.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          This method ensures that no trip can be uniquely identified while maintaining useful insights.
        </p>
      </div>
    </div>
  );
};

export default Guide;